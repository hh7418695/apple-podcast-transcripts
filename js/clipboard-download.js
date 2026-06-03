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

  // Call clipboard API directly — wrapping in Promise.resolve() loses the user gesture
  if (!navigator.clipboard?.writeText) {
    onFail(new Error('Clipboard API is unavailable. Use HTTPS or allow clipboard access.'));
    return;
  }

  navigator.clipboard.writeText(text).then(onDone, onFail);
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
