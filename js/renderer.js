import { copyText, downloadTextFile } from './clipboard-download.js';
import {
  createCardButton,
  esc,
  formatDate,
  formatTime,
  safeExternalUrl,
  transcriptToPlainText,
} from './utils.js';

export function showLoadingState({ podcasts, searchInput }) {
  document.body.classList.add('top');
  document.querySelector('.explanation')?.classList.add('is-loaded');
  podcasts.innerHTML = '<div class="noPodcasts text-center">Loading transcripts…</div>';
  searchInput.value = '';
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
    <div class="title">Metadata unavailable</div>
    <div>${esc(metadataWarningMessage)}</div>
  `;
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

    card.innerHTML = `
      <div class="card-header">
        <div class="info">${esc(formatDate(transcript.time))} · ${esc(formatTime(transcript.duration))}</div>
        <div class="title">${esc(transcript.title)}</div>
        <span class="author">${esc(transcript.author)}</span>
        <div class="description">${esc(description)}</div>
      </div>
      <div class="card-actions">
      </div>
      <div class="preview-content">
        ${previewHtml}
        ${hasMore ? `<span class="preview-more">Open full transcript to read more…</span>` : ''}
      </div>
    `;

    const actions = card.querySelector('.card-actions');
    actions.append(
      createCardButton('btn-preview', 'Preview ▾'),
      createCardButton('btn-copy-card', 'Copy'),
      createCardButton('button--info btn-download-txt', 'Download TXT'),
      createCardButton('button--primary btn-play', '▶ Play', {
        disabled: (!transcript.audioFile && !safeAudioUrl) || !audioPlayer,
        title: transcript.audioFile ? 'Play local audio' : safeAudioUrl ? 'Play from URL' : 'No audio available',
      }),
      createCardButton('button--success btn-source', 'Direct URL', {
        disabled: !safeAudioUrl,
        title: safeAudioUrl
          ? 'Open direct audio URL'
          : transcript.audioUrl
            ? 'Unsupported direct audio URL'
            : 'No direct audio URL available',
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
      openTranscriptPopup(transcript.transcripts, e.currentTarget);
    });

    card.querySelector('.btn-full').addEventListener('click', (e) => {
      e.stopPropagation();
      openTranscriptPopup(transcript.transcripts, e.currentTarget);
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

    const playBtn = card.querySelector('.btn-play');
    if ((transcript.audioFile || safeAudioUrl) && audioPlayer) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = transcript.audioFile || safeAudioUrl;
        audioPlayer.play(src, transcript.title);
      });
    }

    const sourceBtn = card.querySelector('.btn-source');
    if (safeAudioUrl) {
      sourceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(safeAudioUrl, '_blank');
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
        openTranscriptPopup(transcript.transcripts, e.currentTarget);
      });
    }

    podcasts.appendChild(card);
  }
}

export function createTranscriptModalController() {
  const transcriptModal = document.querySelector('#transcript');
  const modalContent = document.querySelector('#transcript .content');
  const modalCopyBtn = document.querySelector('.modal-copy-btn');
  const modalCloseBtn = document.querySelector('.xout');
  const modalFocusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let transcriptTrigger = null;

  function getModalFocusableElements() {
    return [...transcriptModal.querySelectorAll(modalFocusableSelector)]
      .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }

  function closeTranscriptPopup() {
    if (!document.body.classList.contains('popupOpen')) return;
    document.body.classList.remove('popupOpen');

    if (transcriptTrigger && typeof transcriptTrigger.focus === 'function' && document.contains(transcriptTrigger)) {
      transcriptTrigger.focus();
    }
    transcriptTrigger = null;
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
    open(chunks, trigger) {
      transcriptTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
      document.body.classList.add('popupOpen');
      modalContent.innerHTML = chunks.map(s => {
        const spk = s.speaker ? `<div class="transcript-speaker">${esc(s.speaker)}</div>` : '';
        return `${spk}<p>${esc(s.sentences)}</p>`;
      }).join('');
      modalContent.scrollTop = 0;

      modalCopyBtn.textContent = 'Copy';
      modalCopyBtn.classList.remove('copied');
      modalCopyBtn.onclick = () => copyText(transcriptToPlainText(chunks), modalCopyBtn);
      requestAnimationFrame(() => modalCloseBtn.focus());
    },
  };
}
