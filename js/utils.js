export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

export function safeExternalUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function createCardButton(className, text, { disabled = false, title = '' } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `button card-btn ${className}`;
  btn.textContent = text;
  btn.disabled = disabled;
  btn.title = title;
  return btn;
}

export function sanitizeFilename(name, fallback = 'download', maxLength = 200) {
  const safeMaxLength = Math.max(1, maxLength);
  const rawName = String(name || '').trim();
  const cleaned = (rawName.toLowerCase() === 'unknown' ? '' : rawName)
    .replace(/[\/\\:*?"<>|]+/g, '-')
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  const safeFallback = String(fallback || 'download')
    .replace(/[\/\\:*?"<>|]+/g, '-')
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') || 'download';
  return (cleaned || safeFallback).slice(0, safeMaxLength).trim() || safeFallback;
}

export function transcriptToPlainText(chunks) {
  return chunks.map(s => {
    const parts = [];
    if (s.speaker) parts.push(`[${s.speaker}]`);
    parts.push(s.sentences);
    return parts.join('\n');
  }).join('\n\n');
}

export function debounce(fn, delay) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function promiseAllLimit(tasks, limit) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.min(limit, tasks.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  });
  return Promise.all(workers).then(() => results);
}

export function formatTime(totalSeconds) {
  if (totalSeconds === -1) return 'Unknown';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return minutes ? `${hours} HR ${minutes} MIN` : `${hours} HR`;
  return `${minutes} MIN`;
}

export function formatDate(unixTime) {
  if (unixTime === -1) return 'Unknown';
  return new Date(unixTime * 1000).toLocaleString('default', { month: 'long', year: 'numeric', day: 'numeric' });
}
