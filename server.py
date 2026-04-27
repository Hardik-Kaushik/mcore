"""
M-CORE VISION — Python alternative server.

Serves static assets from /public and persists form submissions to
/data/submissions.json. Zero external dependencies. Run with:

    python server.py

Then open http://localhost:3000
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).parent.resolve()
PUBLIC_DIR = ROOT / "public"
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "submissions.json"
PORT = int(os.environ.get("PORT", "3000"))

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Make sure a few friendly mime types are registered
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")


def ensure_data_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


def read_submissions() -> list:
    ensure_data_file()
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8") or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def write_submissions(items: list) -> None:
    ensure_data_file()
    DATA_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


def sanitize(value, max_len: int = 2000) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def safe_join(base: Path, target: str) -> Path | None:
    target = target.lstrip("/").replace("\\", "/")
    candidate = (base / target).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return None
    return candidate


class Handler(BaseHTTPRequestHandler):
    server_version = "MCoreVision/1.0"

    # ------------------------------------------------------------------ utils
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, status: int = 200) -> None:
        ctype, _ = mimetypes.guess_type(str(path))
        if ctype is None:
            ctype = "application/octet-stream"
        data = path.read_bytes()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=300")
        self.end_headers()
        self.wfile.write(data)

    def _not_found(self) -> None:
        fallback = PUBLIC_DIR / "404.html"
        if fallback.exists():
            self._send_file(fallback, status=404)
        else:
            body = b"Not found"
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:  # noqa: N802 (API name)
        # Quieter logs
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} - {fmt % args}")

    # ---------------------------------------------------------------- routing
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path or "/"

        if path == "/api/submissions":
            items = read_submissions()
            self._send_json(200, {"ok": True, "count": len(items), "submissions": items})
            return
        if path.startswith("/api/"):
            self._send_json(404, {"ok": False, "error": "Unknown endpoint"})
            return

        self._serve_static(path)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path or "/"

        if path == "/api/submit":
            self._handle_submit()
            return
        if path.startswith("/api/"):
            self._send_json(404, {"ok": False, "error": "Unknown endpoint"})
            return

        self.send_response(405)
        self.send_header("Allow", "GET, HEAD")
        self.end_headers()

    # ---------------------------------------------------------------- handlers
    def _handle_submit(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 64 * 1024:
            self._send_json(413, {"ok": False, "error": "Payload too large"})
            return
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            data = json.loads(raw or "{}")
            if not isinstance(data, dict):
                raise ValueError("payload must be object")
        except Exception:
            self._send_json(400, {"ok": False, "error": "Invalid JSON payload"})
            return

        submission = {
            "id": f"sub_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:6]}",
            "type": sanitize(data.get("type") or "contact", 40),
            "name": sanitize(data.get("name"), 120),
            "email": sanitize(data.get("email"), 160),
            "phone": sanitize(data.get("phone"), 40),
            "subject": sanitize(data.get("subject"), 200),
            "message": sanitize(data.get("message"), 4000),
            "company": sanitize(data.get("company"), 160),
            "interest": sanitize(data.get("interest"), 160),
            "experience": sanitize(data.get("experience"), 60),
            "role": sanitize(data.get("role"), 160),
            "resume": sanitize(data.get("resume"), 500),
            "source": sanitize(data.get("source"), 120),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "ip": (self.headers.get("X-Forwarded-For") or self.client_address[0] or "")[:80],
        }

        if not submission["name"] or not submission["email"]:
            self._send_json(400, {"ok": False, "error": "Name and email are required."})
            return
        if not EMAIL_RE.match(submission["email"]):
            self._send_json(400, {"ok": False, "error": "Please provide a valid email address."})
            return

        items = read_submissions()
        items.append(submission)
        write_submissions(items)

        self._send_json(
            200,
            {
                "ok": True,
                "id": submission["id"],
                "message": "Thank you. We've received your enquiry and will be in touch shortly.",
            },
        )

    # ----------------------------------------------------------------- static
    def _serve_static(self, path: str) -> None:
        path = unquote(path)
        if path in ("", "/"):
            path = "/index.html"
        resolved = safe_join(PUBLIC_DIR, path)
        if resolved is None:
            self.send_response(400)
            self.end_headers()
            return

        if resolved.is_file():
            self._send_file(resolved)
            return

        # try extensionless -> .html
        if resolved.suffix == "":
            with_html = resolved.with_suffix(".html")
            if with_html.is_file():
                self._send_file(with_html)
                return

        self._not_found()


def main() -> None:
    ensure_data_file()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"M-CORE VISION website running at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        httpd.server_close()


if __name__ == "__main__":
    main()
