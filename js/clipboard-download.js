import { sanitizeFilename } from './utils.js';

function showClipboardFallback(text, error) {
  document.querySelector('.clipboard-fallback')?.remove();

  const fallback = document.createElement('div');
  fallback.className = 'clipboard-fallback';

  const message = document.createElement('p');
  const reason = error?.message ? ` Reason: ${error.message}` : '';
  message.textContent = `Copy failed. Select the text below and copy it manually.${reason}`;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => fallback.remove());

  fallback.append(message, textarea, closeBtn);
  document.body.appendChild(fallback);
  textarea.focus();
  textarea.select();
}

function copyWithExecCommand(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  // Prevent iOS zoom on focus
  textarea.style.fontSize = '16px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const ok = document.execCommand('copy');
    return ok;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function copyText(text, btn) {
  const orig = btn.textContent;
  const wasDisabled = btn.disabled;

  document.querySelector('.clipboard-fallback')?.remove();
  btn.textContent = 'Copying...';
  btn.disabled = true;

  function onDone() {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
      btn.disabled = wasDisabled;
    }, 2000);
  }

  function onFail(error) {
    btn.textContent = orig;
    btn.classList.remove('copied');
    btn.disabled = wasDisabled;
    showClipboardFallback(text, error);
  }

  // 1. Modern async clipboard API (requires HTTPS)
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onDone, () => {
      // 2. Fallback to legacy execCommand (works on HTTP)
      if (copyWithExecCommand(text)) {
        onDone();
      } else {
        onFail(new Error('Clipboard copy failed. Use HTTPS or allow clipboard access.'));
      }
    });
    return;
  }

  // 2. Legacy execCommand for environments without Clipboard API
  if (copyWithExecCommand(text)) {
    onDone();
  } else {
    onFail(new Error('Clipboard API is unavailable. Use HTTPS or allow clipboard access.'));
  }
}

export function downloadTextFile(title, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(title, 'transcript')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatSrtTime(seconds) {
  if (seconds == null || !isFinite(seconds)) return '00:00:00,000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatVttTime(seconds) {
  if (seconds == null || !isFinite(seconds)) return '00:00:00.000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function downloadSrtFile(title, chunks) {
  let lines = [];
  let idx = 1;
  for (const chunk of chunks) {
    const segs = chunk.segments && chunk.segments.length > 0 ? chunk.segments : [chunk];
    for (const seg of segs) {
      if (seg.begin == null && seg.end == null) continue;
      const speaker = chunk.speaker ? `[${chunk.speaker}] ` : '';
      lines.push(String(idx));
      lines.push(`${formatSrtTime(seg.begin)} --> ${formatSrtTime(seg.end)}`);
      lines.push(`${speaker}${seg.text || seg.sentences || ''}`);
      lines.push('');
      idx++;
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(title, 'transcript')}.srt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadVttFile(title, chunks) {
  let lines = ['WEBVTT', ''];
  for (const chunk of chunks) {
    const segs = chunk.segments && chunk.segments.length > 0 ? chunk.segments : [chunk];
    for (const seg of segs) {
      if (seg.begin == null && seg.end == null) continue;
      const speaker = chunk.speaker ? `<v ${chunk.speaker}>` : '';
      const speakerClose = chunk.speaker ? '</v>' : '';
      lines.push(`${formatVttTime(seg.begin)} --> ${formatVttTime(seg.end)}`);
      lines.push(`${speaker}${seg.text || seg.sentences || ''}${speakerClose}`);
      lines.push('');
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(title, 'transcript')}.vtt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadMarkdownFile(title, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(title, 'transcript')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAudioFile(title, audioFile) {
  const url = URL.createObjectURL(audioFile);
  const a = document.createElement('a');
  const extensionMatch = audioFile.name.match(/\.([^.]+)$/);
  const extension = sanitizeFilename(extensionMatch?.[1], 'audio', 16);
  const baseMaxLength = Math.max(1, 200 - extension.length - 1);
  a.href = url;
  a.download = `${sanitizeFilename(title, 'audio', baseMaxLength)}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}
