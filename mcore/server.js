/* eslint-disable no-console */
/**
 * M-CORE VISION — zero-dependency Node server.
 * Serves static assets from /public and persists form submissions to /data/submissions.json.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readSubmissions() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8') || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read submissions file:', err);
    return [];
  }
}

function writeSubmissions(list) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sanitizeString(value, maxLen = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleSubmit(req, res) {
  try {
    const raw = await readBody(req);
    let data;
    try {
      data = JSON.parse(raw || '{}');
    } catch (_e) {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON payload' });
    }

    const submission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: sanitizeString(data.type || 'contact', 40),
      name: sanitizeString(data.name, 120),
      email: sanitizeString(data.email, 160),
      phone: sanitizeString(data.phone, 40),
      subject: sanitizeString(data.subject, 200),
      message: sanitizeString(data.message, 4000),
      company: sanitizeString(data.company, 160),
      interest: sanitizeString(data.interest, 160),
      experience: sanitizeString(data.experience, 60),
      role: sanitizeString(data.role, 160),
      resume: sanitizeString(data.resume, 500),
      source: sanitizeString(data.source, 120),
      createdAt: new Date().toISOString(),
      ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().slice(0, 80)
    };

    if (!submission.name || !submission.email) {
      return sendJson(res, 400, { ok: false, error: 'Name and email are required.' });
    }
    if (!isValidEmail(submission.email)) {
      return sendJson(res, 400, { ok: false, error: 'Please provide a valid email address.' });
    }

    const list = readSubmissions();
    list.push(submission);
    writeSubmissions(list);

    return sendJson(res, 200, {
      ok: true,
      id: submission.id,
      message: "Thank you. We've received your enquiry and will be in touch shortly."
    });
  } catch (err) {
    console.error('submit error', err);
    return sendJson(res, 500, { ok: false, error: 'Server error. Please try again later.' });
  }
}

function handleList(_req, res) {
  const list = readSubmissions();
  sendJson(res, 200, { ok: true, count: list.length, submissions: list });
}

function safeJoin(base, target) {
  const targetPath = path.posix.normalize('/' + target.replace(/\\/g, '/'));
  const joined = path.join(base, targetPath);
  if (!joined.startsWith(base)) return null;
  return joined;
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/') pathname = '/index.html';

  let filePath = safeJoin(PUBLIC_DIR, pathname);
  if (!filePath) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Try .html fallback for extensionless routes
      if (!path.extname(filePath)) {
        const withHtml = filePath + '.html';
        if (fs.existsSync(withHtml)) return streamFile(withHtml, res);
      }
      // 404 page
      const notFound = path.join(PUBLIC_DIR, '404.html');
      if (fs.existsSync(notFound)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(notFound).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    streamFile(filePath, res);
  });
}

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=300'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  // API routes
  if (pathname === '/api/submit' && req.method === 'POST') return handleSubmit(req, res);
  if (pathname === '/api/submissions' && req.method === 'GET') return handleList(req, res);
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Unknown endpoint' });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }

  serveStatic(req, res);
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`M-CORE VISION website running at http://localhost:${PORT}`);
});
