import { copyText } from './clipboard-download.js';
import { buildTranscriptMetadata } from './database.js';
import {
  collectFromDataTransferItems,
  collectFromFileList,
  createRelevantFiles,
  mergeRelevantFiles,
} from './file-collection.js';
import {
  createTranscriptModalController,
  renderPodcasts,
  showLoadError,
  showLoadingState,
  updateLoadingProgress,
} from './renderer.js';
import { debounce } from './utils.js';
import { createAudioPlayer } from './audio-player.js';

const ANALYTICS_ID = 'G-M15SP790QM';

function readLocalStorageValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function analyticsPreference() {
  const preference = new URLSearchParams(window.location.search).get('analytics');
  if (preference === '1') return true;
  if (preference === '0') return false;
  if (readLocalStorageValue('podcastTranscriptAnalytics') === 'off') return false;
  return window.location.protocol === 'https:' && window.location.hostname === 'alexbeals.com';
}

function loadAnalytics() {
  if (!analyticsPreference()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ANALYTICS_ID, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
  script.onerror = () => console.info('Analytics unavailable; continuing without it.');
  document.head.appendChild(script);
}

function getCompatibilityIssue() {
  const testInput = document.createElement('input');
  testInput.type = 'file';
  const supportsWebkitDirectory = 'webkitdirectory' in testInput;
  const supportsDirectoryDrag = typeof DataTransferItem !== 'undefined' &&
    'webkitGetAsEntry' in DataTransferItem.prototype;
  const supportsDirectoryPicker = 'showDirectoryPicker' in window;
  const supportsDirectoryAccess = supportsWebkitDirectory || supportsDirectoryDrag || supportsDirectoryPicker;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isMac = /mac/i.test(platform);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (!isMac) {
    return 'This tool reads Apple Podcasts transcript files from the local macOS Podcasts cache. Open it on a Mac where the Podcasts app has already cached the transcript.';
  }

  if (!supportsDirectoryAccess) {
    return hasTouch
      ? 'This browser does not expose folder access for local Podcasts files. Use a desktop Mac browser with folder upload or directory drag-and-drop support.'
      : 'This browser does not expose folder upload or directory drag-and-drop support. Try Safari, Chrome, or Edge on macOS.';
  }

  return '';
}

loadAnalytics();

// ── Theme ──
function getTheme() {
  const stored = readLocalStorageValue('podcastTranscriptTheme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try { window.localStorage.setItem('podcastTranscriptTheme', next); } catch {}
  applyTheme(next);
}

applyTheme(getTheme());
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!readLocalStorageValue('podcastTranscriptTheme')) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

const compatibilityIssue = getCompatibilityIssue();
if (compatibilityIssue) {
  document.querySelector('.explanation').innerHTML = `
    <h1>Apple Podcast Transcript Viewer</h1>
    <p>${compatibilityIssue}</p>`;
}

const dropZone = document.body;
const podcasts = document.getElementById('podcasts');
const searchInput = document.getElementById('search');
const folderSelectBtn = document.getElementById('selectFolderBtn');
const folderInput = document.getElementById('folderInput');
const folderSelectionStatus = document.getElementById('folderSelectionStatus');
const copyTargetPathBtn = document.getElementById('copyTargetPathBtn');
const sortSelect = document.getElementById('sortSelect');
const resetBtn = document.getElementById('resetBtn');
const targetTranscriptPath = '~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML';

let allTranscripts = [];
let accumulatedFolderFiles = createRelevantFiles();
let metadataWarningMessage = '';
let selectedFolderLabels = new Set();

const SQL = await initSqlJs({ locateFile: file => `./${file}` });
const transcriptModal = createTranscriptModalController();
const audioPlayer = createAudioPlayer();

function renderCurrentPodcasts(list) {
  renderPodcasts(list, {
    podcasts,
    searchInput,
    metadataWarningMessage,
    openTranscriptPopup: transcriptModal.open,
    audioPlayer,
  });
}

function sortTranscripts(list, sortBy) {
  const sorted = [...list];
  switch (sortBy) {
    case 'date-asc':
      sorted.sort((a, b) => a.time - b.time);
      break;
    case 'title-asc':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'title-desc':
      sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      break;
    case 'author-asc':
      sorted.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
      break;
    case 'duration-desc':
      sorted.sort((a, b) => b.duration - a.duration);
      break;
    case 'duration-asc':
      sorted.sort((a, b) => a.duration - b.duration);
      break;
    case 'date-desc':
    default:
      sorted.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      break;
  }
  return sorted;
}

function applySortAndRender() {
  const sortBy = sortSelect?.value || 'date-desc';
  const q = searchInput.value.trim().toLowerCase();
  let list = sortTranscripts(allTranscripts, sortBy);
  if (q) {
    list = list.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.author || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }
  renderCurrentPodcasts(list);
}

if (sortSelect) {
  sortSelect.addEventListener('change', applySortAndRender);
}

function folderLabelsFromFileList(files) {
  const labels = new Set();
  for (const file of files) {
    const rootFolder = file.webkitRelativePath?.split('/')[0];
    if (rootFolder) labels.add(rootFolder);
  }
  return labels;
}

function updateFolderSelectionStatus() {
  if (!folderSelectionStatus) return;

  const folderCount = selectedFolderLabels.size;
  const transcriptCount = Object.keys(accumulatedFolderFiles.transcripts).length;
  if (folderCount === 0) {
    folderSelectionStatus.textContent = 'No folders selected yet.';
    return;
  }

  const folderLabel = folderCount === 1 ? 'folder' : 'folders';
  const transcriptLabel = transcriptCount === 1 ? 'transcript' : 'transcripts';
  folderSelectionStatus.textContent =
    `${folderCount} ${folderLabel} added, ${transcriptCount} ${transcriptLabel} found. Use Add Folder to include more.`;
}

async function processRelevantFiles(relevantFiles) {
  const result = buildTranscriptMetadata(SQL, relevantFiles);
  allTranscripts = result.transcripts;
  metadataWarningMessage = result.warningMessage;
  applySortAndRender();
}

function beginLoad() {
  metadataWarningMessage = '';
  showLoadingState({ podcasts, searchInput });
  if (folderSelectBtn) folderSelectBtn.textContent = 'Add Folder';
  if (resetBtn) resetBtn.style.display = '';
}

function resetAll() {
  allTranscripts = [];
  accumulatedFolderFiles = createRelevantFiles();
  metadataWarningMessage = '';
  selectedFolderLabels = new Set();
  document.body.classList.remove('top');
  document.querySelector('.explanation')?.classList.remove('is-loaded');
  podcasts.innerHTML = '';
  searchInput.value = '';
  if (folderSelectBtn) folderSelectBtn.textContent = 'Select Folder';
  if (resetBtn) resetBtn.style.display = 'none';
  if (folderSelectionStatus) folderSelectionStatus.textContent = 'No folders selected yet.';
  if (sortSelect) sortSelect.value = 'date-desc';
  audioPlayer.destroy();
}

if (resetBtn) {
  resetBtn.addEventListener('click', resetAll);
}

if (folderSelectBtn && folderInput) {
  folderSelectBtn.addEventListener('click', () => {
    folderInput.click();
  });

  folderInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files.length) return;

    beginLoad();

    try {
      const relevantFiles = await collectFromFileList(files, (p) =>
        updateLoadingProgress({ podcasts, ...p })
      );
      mergeRelevantFiles(accumulatedFolderFiles, relevantFiles);
      for (const label of folderLabelsFromFileList(files)) {
        selectedFolderLabels.add(label);
      }
      if (selectedFolderLabels.size === 0) {
        selectedFolderLabels.add('selected folder');
      }
      await processRelevantFiles(accumulatedFolderFiles);
      updateFolderSelectionStatus();
    } catch (e) {
      showLoadError(podcasts, e);
    } finally {
      event.target.value = '';
    }
  });
}

if (copyTargetPathBtn) {
  copyTargetPathBtn.addEventListener('click', () => {
    copyText(targetTranscriptPath, copyTargetPathBtn);
  });
}

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('highlight');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('highlight');
});

dropZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropZone.classList.remove('highlight');

  beginLoad();

  try {
    const relevantFiles = await collectFromDataTransferItems(event.dataTransfer.items, (p) =>
      updateLoadingProgress({ podcasts, ...p })
    );
    accumulatedFolderFiles = relevantFiles;
    selectedFolderLabels = new Set(['dropped folder']);
    await processRelevantFiles(relevantFiles);
    updateFolderSelectionStatus();
  } catch (e) {
    showLoadError(podcasts, e);
  }
});

const handleSearchInput = debounce(() => {
  applySortAndRender();
}, 175);

searchInput.addEventListener('input', handleSearchInput);

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in inputs
  const tag = document.activeElement?.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;

  // / → focus search (only when not in an input)
  if (e.key === '/' && !isInput && document.body.classList.contains('top')) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  // Space → play/pause (only when not in input, modal not open)
  if (e.key === ' ' && !isInput && !document.body.classList.contains('popupOpen')) {
    e.preventDefault();
    const audio = audioPlayer.getAudio();
    if (audio) {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    }
    return;
  }

  // ArrowLeft/ArrowRight → seek ±5s (only when not in input, modal not open)
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isInput && !document.body.classList.contains('popupOpen')) {
    const audio = audioPlayer.getAudio();
    if (audio) {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -5 : 5;
      audio.currentTime = Math.max(0, audio.currentTime + delta);
    }
  }
});
