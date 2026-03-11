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

The entire application is a single file: **`index.html`** (~1,563 lines containing all HTML, CSS, and JS).

**Data flow:**
1. User drops `~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML` folder
2. `traverseFileTree()` recursively walks the dropped directory via the Web File API (`webkitGetAsEntry`)
3. `.ttml` files → `extractPodcastTranscripts()` parses XML, extracts speaker/sentence data
4. `MTLibrary.sqlite` + `MTLibrary.sqlite-wal` → loaded into sql.js in-memory database for episode metadata
5. Data merged, sorted by modification date, rendered as podcast cards
6. Clicking a card opens a modal with the full transcript

**Key dependencies (bundled, no npm):**
- `sql-wasm.js` + `sql-wasm.wasm` — sql.js for in-browser SQLite. **This file has been manually patched** to support WAL (Write-Ahead Logging) files. See README for the exact patch. Do not upgrade sql.js without re-applying this patch.

## Important Implementation Notes

### SQLite WAL Support
`sql-wasm.js` is a manually modified version of sql.js. The `Database` constructor was patched to accept a second argument (`zzz`) for the WAL file bytes, mounting it alongside the main db file. If upgrading sql.js, this patch must be re-applied (see README for the exact diff).

### SQLite Schema Variants
The app handles two schema variants when querying `MTLibrary.sqlite` — one with `ZFIRSTTIMEAVAILABLE` column and one without. The query tries both via try/catch.

### readEntries Limitation
The `FileSystemDirectoryReader.readEntries()` API returns at most 100 entries per call. The code loops until the batch is empty to get all files — don't remove this loop.

### TTML Parsing
TTML files are Apple's transcript format (XML-based). The parser looks for `<p>` elements with `ttm:agent` attributes (speaker) and `<span>` elements with `podcasts:unit="sentence"`.
