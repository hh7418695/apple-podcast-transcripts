# CLAUDE.md

## Project

Single-page browser app for viewing Apple Podcast transcripts from local macOS cache. No build step — serve with `python3 -m http.server`.

## Architecture

```
index.html         — HTML shell
css/style.css      — All styles
js/app.js          — Entry: events, state, analytics
js/file-collection.js  — Directory walk, file reads, concurrency (8)
js/database.js     — sql.js + Apple Podcasts SQLite metadata
js/ttml-parser.js  — TTML XML → speaker/sentence chunks
js/renderer.js     — Cards, modal, loading/error states
js/clipboard-download.js — Clipboard + TXT/audio download
js/utils.js        — esc, sanitizeFilename, debounce, promiseAllLimit, format*
```

## Key Constraints

- **sql-wasm.js is patched** for WAL support. Do not upgrade without re-applying the patch (see README history).
- **readEntries returns max 100** — the directory walk loops until empty.
- **SQLite schema detection is dynamic** — `database.js` checks optional columns at runtime (`ZFIRSTTIMEAVAILABLE`, `ZASSETURL`, `ZENCLOSUREURL`, `ZPODCAST`).
- **No npm/build** — dependencies are bundled. No package.json.
