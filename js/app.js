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
  renderCurrentPodcasts(allTranscripts);
}

function beginLoad() {
  metadataWarningMessage = '';
  showLoadingState({ podcasts, searchInput });
  if (folderSelectBtn) folderSelectBtn.textContent = 'Add Folder';
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
      const relevantFiles = await collectFromFileList(files);
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
    const relevantFiles = await collectFromDataTransferItems(event.dataTransfer.items);
    accumulatedFolderFiles = relevantFiles;
    selectedFolderLabels = new Set(['dropped folder']);
    await processRelevantFiles(relevantFiles);
    updateFolderSelectionStatus();
  } catch (e) {
    showLoadError(podcasts, e);
  }
});

const handleSearchInput = debounce(() => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderCurrentPodcasts(allTranscripts);
    return;
  }
  const filtered = allTranscripts.filter(t =>
    (t.title || '').toLowerCase().includes(q) ||
    (t.author || '').toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q)
  );
  renderCurrentPodcasts(filtered);
}, 175);

searchInput.addEventListener('input', handleSearchInput);
