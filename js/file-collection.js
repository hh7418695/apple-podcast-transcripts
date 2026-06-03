import { extractPodcastTranscripts } from './ttml-parser.js';
import { promiseAllLimit } from './utils.js';

const FILE_INSPECTION_CONCURRENCY = 8;
const FILE_DISCOVERY_CONCURRENCY = 8;
const AUDIO_FILE_PATTERN = /\.(mp3|m4a|aac|wav)$/i;

export function createRelevantFiles() {
  return { transcripts: {}, mainDB: null, walFile: null, audioFiles: {} };
}

function isRelevantFileName(name) {
  return name.endsWith('.ttml') ||
    name === 'MTLibrary.sqlite' ||
    name === 'MTLibrary.sqlite-wal' ||
    AUDIO_FILE_PATTERN.test(name);
}

export function mergeRelevantFiles(target, source) {
  target.transcripts = { ...target.transcripts, ...source.transcripts };
  target.audioFiles = { ...target.audioFiles, ...source.audioFiles };
  if (source.mainDB) target.mainDB = source.mainDB;
  if (source.walFile) target.walFile = source.walFile;
  return target;
}

async function inspectFile(file) {
  const info = createRelevantFiles();
  if (!isRelevantFileName(file.name)) return info;

  if (file.name.endsWith('.ttml')) {
    info.transcripts = await extractPodcastTranscripts(file);
  } else if (file.name === 'MTLibrary.sqlite') {
    info.mainDB = await file.arrayBuffer();
  } else if (file.name === 'MTLibrary.sqlite-wal') {
    info.walFile = await file.arrayBuffer();
  } else if (AUDIO_FILE_PATTERN.test(file.name)) {
    const match = file.name.match(/(\d+)/);
    const podcastId = match ? match[1] : null;
    if (podcastId) {
      info.audioFiles[podcastId] = file;
    }
  }
  return info;
}

async function collectFromFiles(files, onProgress) {
  const relevantFiles = createRelevantFiles();
  const candidateFiles = [...files].filter(file => isRelevantFileName(file.name));
  const total = candidateFiles.length;
  let completed = 0;

  if (onProgress) onProgress({ completed: 0, total, phase: 'processing' });

  const results = await promiseAllLimit(
    candidateFiles.map(file => () =>
      inspectFile(file).then(result => {
        completed++;
        if (onProgress) onProgress({ completed, total, phase: 'processing' });
        return result;
      })
    ),
    FILE_INSPECTION_CONCURRENCY
  );
  for (const info of results) {
    mergeRelevantFiles(relevantFiles, info);
  }
  return relevantFiles;
}

async function collectRelevantFilesFromEntry(entry, files) {
  if (entry.isFile) {
    if (!isRelevantFileName(entry.name)) return;

    const file = await new Promise((resolve, reject) => {
      entry.file(resolve, reject);
    });
    files.push(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    while (true) {
      const entries = await new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (entries.length === 0) break;

      await promiseAllLimit(
        entries.map(child => () => collectRelevantFilesFromEntry(child, files)),
        FILE_DISCOVERY_CONCURRENCY
      );
    }
  }
}

export function collectFromFileList(files, onProgress) {
  return collectFromFiles(files, onProgress);
}

export async function collectFromDataTransferItems(items, onProgress) {
  const candidateFiles = [];
  const tasks = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) tasks.push(() => collectRelevantFilesFromEntry(entry, candidateFiles));
  }

  if (onProgress) onProgress({ completed: 0, total: 0, phase: 'discovering' });

  await promiseAllLimit(tasks, FILE_DISCOVERY_CONCURRENCY);

  if (onProgress) onProgress({ completed: candidateFiles.length, total: candidateFiles.length, phase: 'discovering' });

  return collectFromFiles(candidateFiles, onProgress);
}
