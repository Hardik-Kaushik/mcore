# M-CORE VISION PRIVATE LIMITED — Official Website

A professional corporate website for M-CORE VISION PRIVATE LIMITED, inspired by modern enterprise design language (similar to wipro.com) with our own brand identity and palette.

## Highlights

- Clean, editorial corporate design with large hero, bold typography, card grids and a signature orange accent.
- Six full pages: Home, About, Services, Training & Internships, Careers, Contact. Plus a 404 page.
- Forms for contact, internship applications and careers applications — all posting to a JSON datastore.
- Zero runtime dependencies. No build step. No framework lock-in.
- Two server implementations are included so you can run the site with whichever runtime you have available.

## Tech stack

- Static HTML / CSS / vanilla JavaScript front-end (no build step, instant to serve)
- Lightweight HTTP server (no external packages) for static assets + JSON API
- Two interchangeable server entry points:
  - `server.js` — Node.js (>= 14)
  - `server.py` — Python 3.8+
- JSON file storage at `data/submissions.json` acts as a simple database for form submissions

## Run it

### Using Node.js

```bash
node server.js
```

### Using Python (if you don't have Node)

```bash
python server.py
```

Then open http://localhost:3000

## Pages

| Path              | Page                       |
| ----------------- | -------------------------- |
| `/`               | Home                       |
| `/about.html`     | About                      |
| `/services.html`  | Services                   |
| `/training.html`  | Training & Internships     |
| `/careers.html`   | Careers                    |
| `/contact.html`   | Contact                    |

## API

- `POST /api/submit`
  JSON body: `{ type, name, email, phone, subject, message, company, interest, role, experience, resume, source }`
  Fields used depend on the form. `name` and `email` are required; email is format-validated.
  Writes to `data/submissions.json`.

- `GET /api/submissions`
  Returns every submission. Intended for internal use — add authentication before exposing publicly.

## Project structure

```
.
├── server.js              # Node HTTP server + JSON storage API
├── server.py              # Python equivalent (zero-dependency stdlib)
├── package.json           # npm metadata (no dependencies)
├── data/
│   └── submissions.json   # JSON datastore (auto-created)
└── public/
    ├── index.html
    ├── about.html
    ├── services.html
    ├── training.html
    ├── careers.html
    ├── contact.html
    ├── 404.html
    ├── robots.txt
    ├── sitemap.xml
    ├── css/styles.css
    ├── js/main.js
    └── assets/favicon.svg
```

## Design notes

- **Palette**: deep navy (`#0b1a2b`), warm orange accent (`#ff5a1f`), soft neutral surfaces.
- **Type**: Inter, weights 400–800, with tight tracking on display sizes for an editorial feel.
- **Components**: reusable card grid, timeline, split layouts, CTA banner, page head, forms with focus states, accordions.
- **Responsive**: mobile-first breakpoints at 1024px and 720px; mobile navigation collapses into a toggle.

## Replacing placeholders

Before going to production, replace:

- Phone number `+91 85010 20366` and email `mcorevisionpvt@gmail.com` across pages.
- Social links in the footer.
- Add a `data/submissions.json` backup / rotation policy, and put the `/api/submissions` endpoint behind authentication.
