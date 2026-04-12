# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-page browser application that lets macOS users view and copy Apple Podcast transcripts. Users drag-drop their local podcast data folder; all processing happens client-side with no server uploads.

Live at: https://alexbeals.com/projects/podcasts/

## Local Development

No build step. Serve with:
```
python3 -m http.server
```
Then open http://localhost:8000/. Note: file:// protocol does not work due to browser security restrictions on file access.

## Architecture

The application is a no-build static site. **`index.html`** contains the HTML, CSS, bundled sql.js script include, and a small ES module entrypoint. Application logic lives in modules under **`js/`**:

- `js/file-collection.js` — file discovery, drag/drop directory traversal, file reads, and concurrency limits
- `js/database.js` — sql.js database opening and Apple Podcasts metadata queries
- `js/ttml-parser.js` — TTML XML parsing and transcript chunk extraction
- `js/renderer.js` — DOM rendering, podcast cards, load/error states, and transcript modal behavior
- `js/clipboard-download.js` — clipboard fallback UI plus TXT/audio download helpers
- `js/utils.js` — shared helpers such as escaping, filename sanitizing, debounce, formatting, and limited concurrency

**Data flow:**
1. User drops `~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML` folder
2. `collectFromDataTransferItems()` recursively walks the dropped directory via the Web File API (`webkitGetAsEntry`)
3. `.ttml` files → `extractPodcastTranscripts()` parses XML and extracts speaker/sentence data
4. `MTLibrary.sqlite` + `MTLibrary.sqlite-wal` → `buildTranscriptMetadata()` loads sql.js metadata and merges it with transcript data
5. Data is sorted by modification date and passed to `renderPodcasts()`
6. Clicking a card opens the transcript modal created by `createTranscriptModalController()`

**Key dependencies (bundled, no npm):**
- `sql-wasm.js` + `sql-wasm.wasm` — sql.js for in-browser SQLite. **This file has been manually patched** to support WAL (Write-Ahead Logging) files. See README for the exact patch. Do not upgrade sql.js without re-applying this patch.

## Important Implementation Notes

### SQLite WAL Support
`sql-wasm.js` is a manually modified version of sql.js. The `Database` constructor was patched to accept a second argument (`zzz`) for the WAL file bytes, mounting it alongside the main db file. If upgrading sql.js, this patch must be re-applied (see README for the exact diff).

### SQLite Schema Variants
The app handles SQLite schema variants when querying `MTLibrary.sqlite`, including optional `ZFIRSTTIMEAVAILABLE`, `ZASSETURL`, `ZENCLOSUREURL`, and `ZPODCAST` columns. Keep schema-detection logic in `js/database.js`.

### readEntries Limitation
The `FileSystemDirectoryReader.readEntries()` API returns at most 100 entries per call. The code loops until the batch is empty to get all files — don't remove this loop.

### TTML Parsing
TTML files are Apple's transcript format (XML-based). The parser in `js/ttml-parser.js` looks for `<p>` elements with `ttm:agent` attributes (speaker) and `<span>` elements with `podcasts:unit="sentence"`.
