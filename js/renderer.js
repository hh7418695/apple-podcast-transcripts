import { copyText, downloadTextFile, downloadAudioFile, downloadSrtFile, downloadVttFile, downloadMarkdownFile } from './clipboard-download.js';
import {
  createCardButton,
  esc,
  formatDate,
  formatTime,
  safeExternalUrl,
  transcriptToPlainText,
  transcriptToMarkdown,
} from './utils.js';
import { createSpeechSyncer } from './speech-sync.js';

// ── Batch selection ──
let batchSelected = new Set();
let batchToolbar = null;

function ensureBatchToolbar() {
  if (batchToolbar) return;
  batchToolbar = document.createElement('div');
  batchToolbar.className = 'batch-toolbar';
  batchToolbar.innerHTML = `
    <span class="batch-count"></span>
    <button class="button batch-btn" data-action="select-all">Select All</button>
    <button class="button batch-btn" data-action="deselect-all">Deselect</button>
    <button class="button button--primary batch-btn" data-action="copy-txt">Copy TXT</button>
    <button class="button button--primary batch-btn" data-action="copy-md">Copy MD</button>
    <button class="button button--info batch-btn" data-action="download-txt">⬇ TXT</button>
    <button class="button button--info batch-btn" data-action="download-md">⬇ MD</button>
  `;
  document.body.appendChild(batchToolbar);
}

function updateBatchToolbar(list) {
  if (!batchToolbar) return;
  const count = batchSelected.size;
  batchToolbar.style.display = count > 0 ? 'flex' : 'none';
  const countEl = batchToolbar.querySelector('.batch-count');
  if (countEl) countEl.textContent = `${count} selected`;
}

function getSelectedTranscripts(list) {
  return list.filter((_, i) => batchSelected.has(i));
}

export function showLoadingState({ podcasts, searchInput }) {
  document.body.classList.add('top');
  document.querySelector('.explanation')?.classList.add('is-loaded');
  searchInput.value = '';
  podcasts.innerHTML = `
    <div class="noPodcasts text-center">
      <div class="title empty-state-title">Loading transcripts…</div>
      <div class="load-progress-wrap">
        <div class="load-progress-bar" style="width:0%"></div>
      </div>
      <div class="load-progress-text"></div>
    </div>`;
}

export function updateLoadingProgress({ podcasts, completed, total, phase }) {
  const bar = podcasts.querySelector('.load-progress-bar');
  const text = podcasts.querySelector('.load-progress-text');
  if (phase === 'discovering') {
    if (text) text.textContent = `Scanning folder structure…`;
  } else if (bar && text) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    bar.style.width = `${pct}%`;
    text.textContent = `${completed} / ${total} files processed`;
  }
}

export function showLoadError(podcasts, e) {
  podcasts.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'noPodcasts text-center';
  div.innerHTML = `
    <div class="title empty-state-title">Something went wrong!</div><br>
    <pre><code>${esc(String(e))}</code></pre><br>
    If you <a target="_blank" href="https://github.com/hh7418695/apple-podcast-transcripts/issues">create an issue on Github with the above error</a> I can try and fix the problem!
  `;
  podcasts.appendChild(div);
  console.error(e);
}

function appendMetadataWarning(podcasts, metadataWarningMessage) {
  if (!metadataWarningMessage) return;

  const div = document.createElement('div');
  div.className = 'metadata-warning';
  div.innerHTML = `
    <div class="metadata-warning-header">
      <div class="title">Metadata unavailable</div>
      <button class="metadata-warning-close" type="button" aria-label="Dismiss warning">✕</button>
    </div>
    <div>${esc(metadataWarningMessage)}</div>
  `;
  div.querySelector('.metadata-warning-close').addEventListener('click', () => div.remove());
  podcasts.appendChild(div);
}

export function renderPodcasts(list, { podcasts, searchInput, metadataWarningMessage, openTranscriptPopup, audioPlayer }) {
  podcasts.innerHTML = '';
  appendMetadataWarning(podcasts, metadataWarningMessage);

  if (list.length === 0) {
    const div = document.createElement('div');
    div.className = 'noPodcasts text-center';
    const isSearching = searchInput.value.trim().length > 0;
    div.innerHTML = isSearching
      ? `<div class="title empty-state-title">No results found</div><br>Try a different keyword.`
      : `<div class="title empty-state-title">No podcast transcripts found</div><br>
         Make sure you followed step 1 to locally cache the transcript data so it can be read.<br><br>
         <div><span class="indicator">1</span>Go to the episode in the <a href="podcasts://">MacOS Podcasts app</a> and click where it says 'Transcript'.</div>`;
    podcasts.appendChild(div);
    return;
  }

  const searchQuery = (searchInput.value || '').trim();
  const searchTerms = searchQuery ? searchQuery.toLowerCase().split(/\s+/).filter(Boolean) : [];

  function highlightText(text) {
    if (!searchTerms.length) return esc(text);
    const escaped = esc(text);
    // Build regex from all terms, respecting already-escaped HTML
    const pattern = searchTerms
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark class="search-highlight">$1</mark>');
  }

  for (const transcript of list) {
    let description = transcript.description;
    if (!description) {
      description = transcript.transcripts
        .flatMap(s => s.sentences.split(/(?<=\.)\s+/))
        .slice(0, 3)
        .join(' ');
    }

    const card = document.createElement('div');
    card.className = 'podcast';

    const previewChunks = transcript.transcripts.slice(0, 5);
    const previewHtml = previewChunks.map(s => {
      const spk = s.speaker ? `<div class="preview-speaker">${esc(s.speaker)}</div>` : '';
      return `${spk}<p>${esc(s.sentences)}</p>`;
    }).join('');
    const hasMore = transcript.transcripts.length > 5;
    const safeAudioUrl = safeExternalUrl(transcript.audioUrl);
    const safeAppleLink = safeExternalUrl(transcript.appleLink);

    const cardIndex = list.indexOf(transcript);
    const checkedAttr = batchSelected.has(cardIndex) ? ' checked' : '';

    card.innerHTML = `
      <label class="batch-checkbox-wrap" title="Select for batch">
        <input class="batch-checkbox" type="checkbox" data-index="${cardIndex}"${checkedAttr}>
      </label>
      <div class="card-header">
        <div class="info">${esc(formatDate(transcript.time))} · ${esc(formatTime(transcript.duration))}</div>
        <div class="title">${highlightText(transcript.title)}</div>
        <span class="author">${highlightText(transcript.author)}</span>
        <div class="description">${highlightText(description)}</div>
      </div>
      <div class="card-actions">
      </div>
      <div class="preview-content">
        ${previewHtml}
        ${hasMore ? `<span class="preview-more">Open full transcript to read more…</span>` : ''}
      </div>
    `;

    const actions = card.querySelector('.card-actions');
    const mdText = transcriptToMarkdown(transcript);
    actions.append(
      createCardButton('btn-preview', 'Preview ▾'),
      createCardButton('btn-copy-card', 'Copy'),
      createCardButton('button--info btn-download-txt', 'Download TXT'),
      createCardButton('button--info btn-copy-md', 'Copy MD'),
      createCardButton('button--info btn-download-md', 'Download MD'),
      createCardButton('button--primary btn-play', '▶ Play', {
        disabled: (!transcript.audioFile && !safeAudioUrl) || !audioPlayer,
        title: transcript.audioFile ? 'Play local audio' : safeAudioUrl ? 'Play from URL' : 'No audio available',
      }),
      createCardButton('button--success btn-source', '⬇ Audio', {
        disabled: !transcript.audioFile && !safeAudioUrl,
        title: transcript.audioFile
          ? 'Download local audio file'
          : safeAudioUrl
            ? 'Download audio'
            : transcript.audioUrl
              ? 'Unsupported audio URL'
              : 'No audio available',
      }),
      createCardButton('button--warning btn-copy-link', 'Copy Link', {
        disabled: !safeAppleLink,
        title: safeAppleLink
          ? 'Copy Apple Podcasts link for Downie'
          : transcript.appleLink
            ? 'Unsupported Apple Podcasts link'
            : 'No Apple Podcasts link available',
      }),
      createCardButton('button--primary btn-full', 'Full transcript'),
    );

    card.querySelector('.card-header').addEventListener('click', (e) => {
      openTranscriptPopup(transcript.transcripts, e.currentTarget, { title: transcript.title, audioPlayer });
    });

    card.querySelector('.btn-full').addEventListener('click', (e) => {
      e.stopPropagation();
      openTranscriptPopup(transcript.transcripts, e.currentTarget, { title: transcript.title, audioPlayer });
    });

    const previewBtn = card.querySelector('.btn-preview');
    const previewDiv = card.querySelector('.preview-content');
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = previewDiv.classList.toggle('open');
      previewBtn.textContent = open ? 'Preview ▴' : 'Preview ▾';
    });

    const copyBtn = card.querySelector('.btn-copy-card');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(transcriptToPlainText(transcript.transcripts), copyBtn);
    });

    const downloadTxtBtn = card.querySelector('.btn-download-txt');
    downloadTxtBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadTextFile(transcript.title, transcriptToPlainText(transcript.transcripts));
    });

    const copyMDBtn = card.querySelector('.btn-copy-md');
    copyMDBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(mdText, copyMDBtn);
    });

    const downloadMDBtn = card.querySelector('.btn-download-md');
    downloadMDBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadMarkdownFile(transcript.title, mdText);
    });

    // Batch checkbox
    const checkbox = card.querySelector('.batch-checkbox');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        batchSelected.add(cardIndex);
      } else {
        batchSelected.delete(cardIndex);
      }
      updateBatchToolbar(list);
    });

    const playBtn = card.querySelector('.btn-play');
    if ((transcript.audioFile || safeAudioUrl) && audioPlayer) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = transcript.audioFile || safeAudioUrl;
        audioPlayer.play(src, transcript.title);
      });
    }

    const sourceBtn = card.querySelector('.btn-source');
    if (transcript.audioFile || safeAudioUrl) {
      sourceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (transcript.audioFile) {
          downloadAudioFile(transcript.title, transcript.audioFile);
        } else {
          // Trigger download for remote URL via <a download>
          const a = document.createElement('a');
          a.href = safeAudioUrl;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });
    }

    const copyLinkBtn = card.querySelector('.btn-copy-link');
    if (safeAppleLink) {
      copyLinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyText(safeAppleLink, copyLinkBtn);
      });
    }

    const previewMore = card.querySelector('.preview-more');
    if (previewMore) {
      previewMore.addEventListener('click', (e) => {
        e.stopPropagation();
        openTranscriptPopup(transcript.transcripts, e.currentTarget, { title: transcript.title, audioPlayer });
      });
    }

    podcasts.appendChild(card);
  }

  // Batch toolbar
  ensureBatchToolbar();
  updateBatchToolbar(list);

  if (batchToolbar && !batchToolbar._wired) {
    batchToolbar._wired = true;
    batchToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'select-all') {
        for (let i = 0; i < list.length; i++) batchSelected.add(i);
        renderPodcasts(list, { podcasts, searchInput, metadataWarningMessage, openTranscriptPopup, audioPlayer });
      } else if (action === 'deselect-all') {
        batchSelected.clear();
        renderPodcasts(list, { podcasts, searchInput, metadataWarningMessage, openTranscriptPopup, audioPlayer });
      } else if (action === 'copy-txt' || action === 'copy-md' || action === 'download-txt' || action === 'download-md') {
        const selected = getSelectedTranscripts(list);
        if (selected.length === 0) return;

        const parts = selected.map((t, i) => {
          const sep = i > 0 ? '\n\n---\n\n' : '';
          if (action === 'copy-md' || action === 'download-md') {
            return sep + transcriptToMarkdown(t);
          }
          return sep + `=== ${t.title} ===\n\n` + transcriptToPlainText(t.transcripts);
        });

        const combined = parts.join('');

        if (action === 'copy-txt' || action === 'copy-md') {
          copyText(combined, btn);
        } else if (action === 'download-txt') {
          downloadTextFile('batch-transcripts', combined);
        } else if (action === 'download-md') {
          downloadMarkdownFile('batch-transcripts', combined);
        }
      }
    });
  }
}

export function createTranscriptModalController() {
  const transcriptModal = document.querySelector('#transcript');
  const modalContent = document.querySelector('#transcript .content');
  const modalCopyBtn = document.querySelector('.modal-copy-btn');
  const modalCloseBtn = document.querySelector('.xout');
  const modalFocusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let transcriptTrigger = null;
  let currentChunks = [];
  let currentTitle = '';
  let currentAudioPlayer = null;
  let lastHighlighted = null;
  let timeUpdateUnsub = null;
  let speechSyncer = null;
  let speechSyncActive = false;
  let timingOffset = 0; // seconds to add to all TTML timestamps

  // Dynamically added action buttons
  let srtBtn = null;
  let vttBtn = null;
  let downloadTxtBtn = null;
  let syncBtn = null;
  let calibrateBtn = null;
  let calibrateSetBtn = null;
  let offsetDisplay = null;

  function ensureActionButtons() {
    if (srtBtn) return;

    const actions = transcriptModal.querySelector('.modal-toolbar-actions');
    const extras = transcriptModal.querySelector('.modal-toolbar-extras');

    downloadTxtBtn = document.createElement('button');
    downloadTxtBtn.type = 'button';
    downloadTxtBtn.className = 'button button--info modal-toolbar-btn';
    downloadTxtBtn.textContent = 'Download TXT';
    downloadTxtBtn.addEventListener('click', () => {
      downloadTextFile(currentTitle, transcriptToPlainText(currentChunks));
    });

    srtBtn = document.createElement('button');
    srtBtn.type = 'button';
    srtBtn.className = 'button button--info modal-toolbar-btn';
    srtBtn.textContent = 'SRT';
    srtBtn.addEventListener('click', () => {
      downloadSrtFile(currentTitle, applyOffsetToChunks(currentChunks));
    });

    vttBtn = document.createElement('button');
    vttBtn.type = 'button';
    vttBtn.className = 'button button--info modal-toolbar-btn';
    vttBtn.textContent = 'VTT';
    vttBtn.addEventListener('click', () => {
      downloadVttFile(currentTitle, applyOffsetToChunks(currentChunks));
    });

    actions.appendChild(downloadTxtBtn);
    actions.appendChild(srtBtn);
    actions.appendChild(vttBtn);

    // Speech sync button
    speechSyncer = createSpeechSyncer();
    if (speechSyncer && speechSyncer.isSupported) {
      syncBtn = document.createElement('button');
      syncBtn.type = 'button';
      syncBtn.className = 'button button--warning modal-toolbar-btn';
      syncBtn.textContent = '🎤 Sync';
      syncBtn.title = 'Real-time speech-to-text transcript sync';
      syncBtn.addEventListener('click', toggleSpeechSync);
      extras.appendChild(syncBtn);
    }

    // Calibrate button
    calibrateBtn = document.createElement('button');
    calibrateBtn.type = 'button';
    calibrateBtn.className = 'button button--warning modal-toolbar-btn';
    calibrateBtn.textContent = '🔧 Calibrate';
    calibrateBtn.title = 'Fix timing offset: click when you hear the first transcript word';
    calibrateBtn.addEventListener('click', startCalibration);
    extras.appendChild(calibrateBtn);

    calibrateSetBtn = document.createElement('button');
    calibrateSetBtn.type = 'button';
    calibrateSetBtn.className = 'button button--primary modal-toolbar-btn';
    calibrateSetBtn.textContent = '▶ Set Now';
    calibrateSetBtn.title = 'Click NOW when you hear the first transcribed word';
    calibrateSetBtn.style.display = 'none';
    calibrateSetBtn.addEventListener('click', applyCalibration);
    extras.appendChild(calibrateSetBtn);

    offsetDisplay = document.createElement('span');
    offsetDisplay.className = 'calibrate-offset';
    extras.appendChild(offsetDisplay);
  }

  function startCalibration() {
    if (!currentAudioPlayer) return;
    timingOffset = 0;
    if (calibrateBtn) calibrateBtn.textContent = '🔧 Listening…';
    if (calibrateSetBtn) calibrateSetBtn.style.display = '';
    if (offsetDisplay) offsetDisplay.textContent = 'Play audio, then click Set Now when you hear the first word';
  }

  function applyCalibration() {
    const audio = currentAudioPlayer?.getAudio();
    if (!audio) return;

    // Find the first segment with timing
    let firstBegin = null;
    for (const chunk of currentChunks) {
      const segs = chunk.segments && chunk.segments.length > 0 ? chunk.segments : [chunk];
      for (const seg of segs) {
        if (seg.begin != null) {
          firstBegin = seg.begin;
          break;
        }
      }
      if (firstBegin != null) break;
    }

    if (firstBegin == null) {
      if (offsetDisplay) offsetDisplay.textContent = 'No timing data to calibrate';
      return;
    }

    timingOffset = audio.currentTime - firstBegin;
    if (calibrateBtn) calibrateBtn.textContent = '🔧 Calibrate';
    if (calibrateSetBtn) calibrateSetBtn.style.display = 'none';
    if (offsetDisplay) {
      offsetDisplay.textContent = `Offset: ${timingOffset >= 0 ? '+' : ''}${timingOffset.toFixed(2)}s`;
    }
  }

  function toggleSpeechSync() {
    if (!speechSyncer || !currentAudioPlayer) return;

    if (speechSyncActive) {
      // Stop sync
      speechSyncer.stop();
      speechSyncActive = false;
      if (syncBtn) {
        syncBtn.textContent = '🎤 Sync';
        syncBtn.classList.remove('button--primary');
        syncBtn.classList.add('button--warning');
      }
      // Re-enable time-based sync
      if (currentAudioPlayer && currentChunks.some(c => c.segments && c.segments.some(s => s.begin != null))) {
        timeUpdateUnsub = null;
        const onUpdate = (t) => highlightSentenceAt(t);
        currentAudioPlayer.onTimeUpdate(onUpdate);
        timeUpdateUnsub = () => currentAudioPlayer.onTimeUpdate(null);
      }
    } else {
      // Start sync
      const started = speechSyncer.start(currentChunks, (segIdx, seg) => {
        if (!speechSyncActive) return;
        highlightSegmentByIndex(segIdx);
      });
      if (started) {
        speechSyncActive = true;
        if (syncBtn) {
          syncBtn.textContent = '🎤 Stop Sync';
          syncBtn.classList.remove('button--warning');
          syncBtn.classList.add('button--primary');
        }
        // Disable time-based sync while speech sync is active
        if (timeUpdateUnsub) {
          timeUpdateUnsub();
          timeUpdateUnsub = null;
        }
        currentAudioPlayer.onTimeUpdate(null);
      }
    }
  }

  /** Highlight a segment in the modal by its flat index */
  function highlightSegmentByIndex(segIdx) {
    if (!modalContent) return;
    const allSegs = modalContent.querySelectorAll('.transcript-segment');
    if (segIdx >= 0 && segIdx < allSegs.length) {
      const el = allSegs[segIdx];
      if (el !== lastHighlighted) {
        if (lastHighlighted) lastHighlighted.classList.remove('transcript-active');
        el.classList.add('transcript-active');
        lastHighlighted = el;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // ── Transcript search ──
  let searchWrap = null;
  let searchInput = null;
  let searchCount = null;
  let searchPrevBtn = null;
  let searchNextBtn = null;
  let searchMarks = [];
  let searchMarkIdx = -1;

  function ensureSearchBar() {
    if (searchWrap) return;
    searchWrap = document.createElement('div');
    searchWrap.className = 'transcript-search-wrap';

    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'transcript-search-input';
    searchInput.placeholder = 'Search transcript…';
    searchInput.setAttribute('aria-label', 'Search transcript');

    searchCount = document.createElement('span');
    searchCount.className = 'transcript-search-count';

    searchPrevBtn = document.createElement('button');
    searchPrevBtn.type = 'button';
    searchPrevBtn.className = 'button transcript-search-nav';
    searchPrevBtn.textContent = '▲';
    searchPrevBtn.title = 'Previous match';
    searchPrevBtn.disabled = true;

    searchNextBtn = document.createElement('button');
    searchNextBtn.type = 'button';
    searchNextBtn.className = 'button transcript-search-nav';
    searchNextBtn.textContent = '▼';
    searchNextBtn.title = 'Next match';
    searchNextBtn.disabled = true;

    searchWrap.append(searchInput, searchCount, searchPrevBtn, searchNextBtn);
    modalContent.insertBefore(searchWrap, modalContent.firstChild);

    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performTranscriptSearch(searchInput.value.trim()), 200);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) gotoMark(-1);
        else gotoMark(1);
      }
    });

    searchPrevBtn.addEventListener('click', () => gotoMark(-1));
    searchNextBtn.addEventListener('click', () => gotoMark(1));
  }

  function performTranscriptSearch(query) {
    // Clear previous highlights
    clearSearchHighlights();

    if (!query) {
      searchMarks = [];
      searchMarkIdx = -1;
      updateSearchCount();
      return;
    }

    // Collect text positions from the original content
    const contentEl = modalContent;
    const walker = document.createTreeWalker(
      contentEl,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) => {
        // Skip search bar and button text nodes
        if (node.parentElement?.closest('.transcript-search-wrap')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('.modal-copy-btn')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('.xout')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }}
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    const lowerQuery = query.toLowerCase();
    searchMarks = [];

    for (const node of textNodes) {
      const text = node.textContent;
      const lower = text.toLowerCase();
      let idx = 0;
      const fragments = [];
      let lastEnd = 0;

      while ((idx = lower.indexOf(lowerQuery, lastEnd)) !== -1) {
        if (idx > lastEnd) {
          fragments.push({ type: 'text', value: text.slice(lastEnd, idx) });
        }
        const markText = text.slice(idx, idx + query.length);
        fragments.push({ type: 'mark', value: markText });
        lastEnd = idx + query.length;
      }

      if (fragments.length === 0) continue;

      if (lastEnd < text.length) {
        fragments.push({ type: 'text', value: text.slice(lastEnd) });
      }

      // Replace the text node with fragment elements
      const parent = node.parentNode;
      const frag = document.createDocumentFragment();
      for (const f of fragments) {
        if (f.type === 'text') {
          frag.appendChild(document.createTextNode(f.value));
        } else {
          const mark = document.createElement('mark');
          mark.className = 'transcript-search-mark';
          mark.textContent = f.value;
          searchMarks.push(mark);
          frag.appendChild(mark);
        }
      }
      parent.replaceChild(frag, node);
    }

    searchMarkIdx = searchMarks.length > 0 ? 0 : -1;
    if (searchMarks.length > 0) {
      searchMarks[0].classList.add('transcript-search-current');
      searchMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    updateSearchCount();
  }

  function gotoMark(dir) {
    if (searchMarks.length === 0) return;
    if (searchMarkIdx >= 0 && searchMarkIdx < searchMarks.length) {
      searchMarks[searchMarkIdx].classList.remove('transcript-search-current');
    }
    searchMarkIdx += dir;
    if (searchMarkIdx >= searchMarks.length) searchMarkIdx = 0;
    if (searchMarkIdx < 0) searchMarkIdx = searchMarks.length - 1;
    searchMarks[searchMarkIdx].classList.add('transcript-search-current');
    searchMarks[searchMarkIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateSearchCount();
  }

  function updateSearchCount() {
    if (!searchCount) return;
    if (searchMarks.length === 0) {
      searchCount.textContent = '';
      if (searchPrevBtn) searchPrevBtn.disabled = true;
      if (searchNextBtn) searchNextBtn.disabled = true;
    } else {
      searchCount.textContent = `${searchMarkIdx + 1}/${searchMarks.length}`;
      if (searchPrevBtn) searchPrevBtn.disabled = false;
      if (searchNextBtn) searchNextBtn.disabled = false;
    }
  }

  function clearSearchHighlights() {
    const marks = modalContent.querySelectorAll('.transcript-search-mark');
    for (const mark of marks) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
    searchMarks = [];
    searchMarkIdx = -1;
    if (searchInput) searchInput.value = '';
    updateSearchCount();
  }

  function hasTimingData(chunks) {
    return chunks.some(c => c.segments && c.segments.some(s => s.begin != null));
  }

  /** Deep-copy chunks with timingOffset applied to all begin/end timestamps */
  function applyOffsetToChunks(chunks) {
    if (!timingOffset) return chunks;
    return chunks.map(c => ({
      ...c,
      begin: c.begin != null ? c.begin + timingOffset : c.begin,
      end: c.end != null ? c.end + timingOffset : c.end,
      segments: (c.segments || []).map(s => ({
        ...s,
        begin: s.begin != null ? s.begin + timingOffset : s.begin,
        end: s.end != null ? s.end + timingOffset : s.end,
      })),
    }));
  }

  function highlightSentenceAt(rawTime) {
    if (!modalContent) return;

    const time = rawTime - timingOffset;
    const spans = modalContent.querySelectorAll('[data-begin]');
    let match = null;
    for (const span of spans) {
      const begin = parseFloat(span.getAttribute('data-begin'));
      const end = parseFloat(span.getAttribute('data-end'));
      if (!isNaN(begin) && !isNaN(end) && time >= begin && time < end) {
        match = span;
        break;
      }
      if (!isNaN(begin) && begin <= time) {
        match = span;
      }
    }

    if (match && match !== lastHighlighted) {
      if (lastHighlighted) lastHighlighted.classList.remove('transcript-active');
      match.classList.add('transcript-active');
      lastHighlighted = match;
      // Smooth scroll to keep the active sentence in view
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function getModalFocusableElements() {
    return [...transcriptModal.querySelectorAll(modalFocusableSelector)]
      .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }

  function closeTranscriptPopup() {
    if (!document.body.classList.contains('popupOpen')) return;
    document.body.classList.remove('popupOpen');

    // Unsubscribe from time updates
    if (timeUpdateUnsub) {
      timeUpdateUnsub();
      timeUpdateUnsub = null;
    }
    // Stop speech sync
    if (speechSyncer && speechSyncActive) {
      speechSyncer.stop();
      speechSyncActive = false;
      if (syncBtn) {
        syncBtn.textContent = '🎤 Sync';
        syncBtn.classList.remove('button--primary');
        syncBtn.classList.add('button--warning');
      }
    }
    lastHighlighted = null;
    timingOffset = 0;
    if (offsetDisplay) offsetDisplay.textContent = '';
    if (calibrateBtn) calibrateBtn.textContent = '🔧 Calibrate';
    if (calibrateSetBtn) calibrateSetBtn.style.display = 'none';

    if (transcriptTrigger && typeof transcriptTrigger.focus === 'function' && document.contains(transcriptTrigger)) {
      transcriptTrigger.focus();
    }
    transcriptTrigger = null;
    currentChunks = [];
    currentAudioPlayer = null;
  }

  transcriptModal.addEventListener('click', (e) => {
    if (e.target === transcriptModal) closeTranscriptPopup();
  });

  modalCloseBtn.addEventListener('click', closeTranscriptPopup);

  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('popupOpen')) return;

    if (e.key === 'Escape') {
      closeTranscriptPopup();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusableElements = getModalFocusableElements();
    if (focusableElements.length === 0) {
      e.preventDefault();
      return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  });

  return {
    open(chunks, trigger, meta = {}) {
      transcriptTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
      document.body.classList.add('popupOpen');
      currentChunks = chunks;
      currentTitle = meta.title || '';
      currentAudioPlayer = meta.audioPlayer || null;
      lastHighlighted = null;

      const timingAvailable = hasTimingData(chunks);

      const chunksHtml = chunks.map((s, ci) => {
        const spk = s.speaker ? `<div class="transcript-speaker">${esc(s.speaker)}</div>` : '';

        if (s.segments && s.segments.length > 0) {
          const segsHtml = s.segments.map((seg, si) => {
            const b = seg.begin != null ? ` data-begin="${seg.begin}"` : '';
            const e = seg.end != null ? ` data-end="${seg.end}"` : '';
            return `<span class="transcript-segment"${b}${e}>${esc(seg.text)}</span>`;
          }).join(' ');
          return `${spk}<div class="transcript-chunk"><p class="transcript-paragraph">${segsHtml}</p><button class="chunk-copy-btn" type="button" title="Copy this paragraph" data-chunk="${ci}">📋</button></div>`;
        }
        // No explicit segments — wrap the whole sentence in a transcript-segment span
        return `${spk}<div class="transcript-chunk"><p><span class="transcript-segment">${esc(s.sentences)}</span></p><button class="chunk-copy-btn" type="button" title="Copy this paragraph" data-chunk="${ci}">📋</button></div>`;
      }).join('');

      modalContent.innerHTML = chunksHtml;
      modalContent.scrollTop = 0;

      // Per-chunk copy (event delegation)
      modalContent.addEventListener('click', (e) => {
        const btn = e.target.closest('.chunk-copy-btn');
        if (!btn) return;
        const idx = parseInt(btn.getAttribute('data-chunk'), 10);
        if (idx >= 0 && idx < chunks.length) {
          const chunk = chunks[idx];
          const text = chunk.speaker ? `[${chunk.speaker}]\n${chunk.sentences}` : chunk.sentences;
          copyText(text, btn);
        }
      });

      // Init transcript search bar
      ensureSearchBar();
      if (searchInput) searchInput.value = '';
      clearSearchHighlights();

      // Click-to-seek (with offset)
      if (timingAvailable && currentAudioPlayer) {
        modalContent.querySelectorAll('[data-begin]').forEach(seg => {
          seg.addEventListener('click', (e) => {
            e.stopPropagation();
            const begin = parseFloat(seg.getAttribute('data-begin'));
            if (!isNaN(begin)) {
              currentAudioPlayer.seek(begin + timingOffset);
            }
          });
        });

        // Subscribe to time updates for highlighting
        timeUpdateUnsub = null;
        const onUpdate = (t) => highlightSentenceAt(t);
        currentAudioPlayer.onTimeUpdate(onUpdate);
        timeUpdateUnsub = () => currentAudioPlayer.onTimeUpdate(null);
      }

      // Reset calibration when opening new transcript
      timingOffset = 0;
      if (offsetDisplay) offsetDisplay.textContent = '';

      // Show/hide SRT/VTT buttons based on timing data
      if (timingAvailable) {
        ensureActionButtons();
        if (srtBtn) srtBtn.style.display = '';
        if (vttBtn) vttBtn.style.display = '';
      } else {
        if (srtBtn) srtBtn.style.display = 'none';
        if (vttBtn) vttBtn.style.display = 'none';
      }
      // TXT button always visible when modal is open
      if (downloadTxtBtn) downloadTxtBtn.style.display = '';
      // Sync & calibrate buttons only when audio is playing AND timing available
      const hasAudio = !!(currentAudioPlayer && currentAudioPlayer.getAudio());
      if (syncBtn) syncBtn.style.display = hasAudio ? '' : 'none';
      if (calibrateBtn) calibrateBtn.style.display = (hasAudio && timingAvailable) ? '' : 'none';
      if (calibrateSetBtn) calibrateSetBtn.style.display = 'none';

      modalCopyBtn.textContent = 'Copy';
      modalCopyBtn.classList.remove('copied');
      modalCopyBtn.onclick = () => copyText(transcriptToPlainText(chunks), modalCopyBtn);
      requestAnimationFrame(() => modalCloseBtn.focus());
    },
  };
}
