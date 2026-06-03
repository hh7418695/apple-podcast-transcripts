# <img src="favicons/favicon-96x96.png" height="32" alt=""/> Apple Podcast Transcript Viewer

View and copy Apple Podcasts transcripts from your local macOS cache — all in the browser, nothing uploaded.

**[Live Demo](https://alexbeals.com/projects/podcasts/)**

## Features

- Drag-and-drop your local Podcasts cache folder — the app finds all transcripts automatically
- Browse by title, author, or description with instant search
- Preview transcripts inline or open the full modal
- Copy to clipboard or download as `.txt`
- Download cached audio files directly
- Open source links in Apple Podcasts or direct audio URLs

## How It Works

1. Open an episode in the **macOS Podcasts app** and view its transcript (this caches the data locally)
2. Drag `~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts` onto this page
3. Browse, search, copy, or download

All processing happens locally. No files leave your computer.

## Local Development

```bash
python3 -m http.server
# → http://localhost:8000
```

> `file://` protocol doesn't work due to browser security restrictions on file access.

## Architecture

```
index.html          — HTML shell + static structure
css/style.css       — All styles
js/
  app.js            — Entry point: event wiring, state, analytics
  file-collection.js — Directory traversal, file discovery, concurrency
  database.js       — SQLite (sql.js) metadata queries
  ttml-parser.js    — Apple TTML transcript parsing
  renderer.js       — DOM rendering, cards, modal controller
  clipboard-download.js — Clipboard fallback, TXT/audio downloads
  utils.js          — Escape, sanitize, debounce, concurrency helpers
```

**Key dependencies (bundled, no npm):**
- `sql-wasm.js` + `sql-wasm.wasm` — [sql.js](https://github.com/sql-js/sql.js) with a manual patch for WAL support

## Credits

Inspired by [@mattdanielmurphy's extractor](https://github.com/mattdanielmurphy/apple-podcast-transcript-extractor).
