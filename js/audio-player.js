import { sanitizeFilename } from './utils.js';

function formatPlayerTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createAudioPlayer() {
  let currentBlobUrl = null;
  let currentTitle = '';
  let container = null;
  let audio = null;
  let titleEl = null;
  let playBtn = null;
  let progressBar = null;
  let currentTimeEl = null;
  let durationEl = null;
  let closeBtn = null;
  let volumeSlider = null;
  let volumeIcon = null;
  let savedVolume = 1;
  let isDragging = false;
  let onTimeUpdateCb = null;

  function buildUI() {
    if (container) return;

    container = document.createElement('div');
    container.className = 'audio-player';
    container.setAttribute('aria-label', 'Audio player');

    titleEl = document.createElement('span');
    titleEl.className = 'audio-player-title';

    playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'audio-player-play button button--primary';
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play');

    currentTimeEl = document.createElement('span');
    currentTimeEl.className = 'audio-player-time';
    currentTimeEl.textContent = '0:00';

    progressBar = document.createElement('input');
    progressBar.type = 'range';
    progressBar.className = 'audio-player-progress';
    progressBar.min = '0';
    progressBar.max = '100';
    progressBar.value = '0';
    progressBar.setAttribute('aria-label', 'Seek');

    durationEl = document.createElement('span');
    durationEl.className = 'audio-player-time';
    durationEl.textContent = '0:00';

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'audio-player-close button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close player');

    volumeIcon = document.createElement('span');
    volumeIcon.className = 'audio-player-volume-icon';
    volumeIcon.textContent = '🔊';
    volumeIcon.title = 'Mute';

    volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.className = 'audio-player-volume';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = '100';
    volumeSlider.setAttribute('aria-label', 'Volume');

    container.append(titleEl, playBtn, currentTimeEl, progressBar, durationEl, volumeIcon, volumeSlider, closeBtn);
    document.body.appendChild(container);
  }

  function removeUI() {
    if (container) {
      container.remove();
      container = null;
      titleEl = null;
      playBtn = null;
      progressBar = null;
      currentTimeEl = null;
      durationEl = null;
      closeBtn = null;
      volumeSlider = null;
      volumeIcon = null;
    }
  }

  function cleanupAudio() {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
    }
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  }

  function updateProgress() {
    if (!audio || !progressBar || isDragging) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progressBar.value = pct;
    if (currentTimeEl) currentTimeEl.textContent = formatPlayerTime(audio.currentTime);
    if (onTimeUpdateCb) onTimeUpdateCb(audio.currentTime);
  }

  function setProgressFromEvent(e) {
    if (!audio) return;
    const pct = Number(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
  }

  function onLoadedMetadata() {
    if (durationEl && audio) {
      durationEl.textContent = formatPlayerTime(audio.duration);
    }
  }

  function onEnded() {
    if (playBtn) playBtn.textContent = '▶';
    if (progressBar) progressBar.value = 0;
    if (currentTimeEl) currentTimeEl.textContent = '0:00';
  }

  function close() {
    cleanupAudio();
    removeUI();
  }

  function togglePlay() {
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(() => {
        // Browser may block autoplay
        if (playBtn) playBtn.textContent = '▶';
      });
      if (playBtn) playBtn.textContent = '⏸';
    } else {
      audio.pause();
      if (playBtn) playBtn.textContent = '▶';
    }
  }

  function wireEvents() {
    playBtn?.addEventListener('click', togglePlay);

    closeBtn?.addEventListener('click', close);

    volumeSlider?.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      if (audio) audio.volume = v;
      if (volumeIcon) {
        volumeIcon.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
      }
      savedVolume = v || 0.01;
    });

    volumeIcon?.addEventListener('click', () => {
      if (!audio) return;
      if (audio.volume > 0) {
        savedVolume = audio.volume;
        audio.volume = 0;
        if (volumeSlider) volumeSlider.value = '0';
        volumeIcon.textContent = '🔇';
      } else {
        const restore = savedVolume > 0 ? savedVolume : 1;
        audio.volume = restore;
        if (volumeSlider) volumeSlider.value = String(Math.round(restore * 100));
        volumeIcon.textContent = restore < 0.5 ? '🔉' : '🔊';
      }
    });

    progressBar?.addEventListener('input', setProgressFromEvent);
    progressBar?.addEventListener('mousedown', () => { isDragging = true; });
    progressBar?.addEventListener('mouseup', () => { isDragging = false; });

    // Keyboard: Space to toggle play/pause when player is focused
    container?.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlay();
      }
    });
  }

  function startPlayback(src, title) {
    // Cleanup previous
    cleanupAudio();

    currentTitle = typeof title === 'string' ? title : sanitizeFilename(title, 'audio', 60);

    if (src instanceof File || src instanceof Blob) {
      currentBlobUrl = URL.createObjectURL(src);
      audio = new Audio(currentBlobUrl);
    } else {
      // Remote URL string
      audio = new Audio(src);
    }

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    buildUI();
    wireEvents();

    if (titleEl) titleEl.textContent = currentTitle;
    if (durationEl) durationEl.textContent = '0:00';
    if (currentTimeEl) currentTimeEl.textContent = '0:00';
    if (progressBar) progressBar.value = 0;
    if (volumeSlider) {
      audio.volume = Number(volumeSlider.value) / 100;
    }

    audio.play().then(() => {
      if (playBtn) playBtn.textContent = '⏸';
    }).catch(() => {
      if (playBtn) playBtn.textContent = '▶';
    });
  }

  return {
    /** Play a local File/Blob or a remote URL string */
    play(src, title) {
      startPlayback(src, title);
    },

    /** Register callback: called every ~250ms with currentTime in seconds */
    onTimeUpdate(cb) {
      onTimeUpdateCb = cb;
    },

    /** Seek to absolute seconds */
    seek(seconds) {
      if (audio) {
        audio.currentTime = seconds;
      }
    },

    /** Get current audio element (null if nothing playing) */
    getAudio() {
      return audio;
    },

    destroy() {
      cleanupAudio();
      removeUI();
    },
  };
}
