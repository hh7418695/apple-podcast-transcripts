/**
 * Speech-recognition-based transcript sync.
 *
 * Continuously listens via the SpeechRecognition API and matches recognized
 * text against the transcript to find the actual playback position — this
 * handles cases where the audio has prefixes (ads, intros) that offset the
 * TTML timestamps.
 */

const MIN_MATCH_LENGTH = 30;    // min characters to consider a match valid
const RECOGNITION_LANG = 'en-US';
const MAX_BUFFER = 600;         // max chars to keep in recognition buffer

export function createSpeechSyncer() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  let recognition = null;
  let isRunning = false;
  let buffer = '';
  let transcriptFlat = '';       // full transcript text for searching
  let segments = [];            // [{ text, begin, end }] flattened
  let onMatchCallback = null;   // called with segment index when match found

  /** Build a flat searchable text from transcript chunks */
  function buildIndex(chunks) {
    segments = [];
    const texts = [];
    for (const chunk of chunks) {
      const segs = chunk.segments && chunk.segments.length > 0 ? chunk.segments : [chunk];
      for (const seg of segs) {
        const text = (seg.text || seg.sentences || '').trim();
        if (text) {
          segments.push({ text, begin: seg.begin, end: seg.end });
          texts.push(text);
        }
      }
    }
    transcriptFlat = texts.join(' ');
  }

  /** Search for the last N chars of buffer in the transcript */
  function findMatch() {
    if (!transcriptFlat || buffer.length < MIN_MATCH_LENGTH) return -1;

    // Try progressively shorter tails of the buffer
    const searchLen = Math.min(buffer.length, 200);
    for (let len = searchLen; len >= MIN_MATCH_LENGTH; len -= 10) {
      const tail = buffer.slice(-len).toLowerCase();
      const idx = transcriptFlat.toLowerCase().indexOf(tail);
      if (idx !== -1) {
        // Count which segment this position falls into
        let charCount = 0;
        for (let i = 0; i < segments.length; i++) {
          charCount += segments[i].text.length + 1; // +1 for space
          if (charCount > idx) return i;
        }
        return segments.length - 1;
      }
    }
    return -1;
  }

  function reset() {
    buffer = '';
    transcriptFlat = '';
    segments = [];
  }

  function stop() {
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    isRunning = false;
  }

  /**
   * Start speech sync.
   * @param {Array} chunks - transcript chunks with segments
   * @param {Function} onMatch - called with segment index when position found
   */
  function start(chunks, onMatch) {
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not available in this browser.');
      return false;
    }

    stop();
    reset();
    buildIndex(chunks);
    onMatchCallback = onMatch;
    buffer = '';

    if (segments.length === 0) {
      console.warn('No transcript segments to sync against.');
      return false;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = RECOGNITION_LANG;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          buffer += ' ' + transcript;
        }
        // Trim buffer
        if (buffer.length > MAX_BUFFER) {
          buffer = buffer.slice(-MAX_BUFFER);
        }
        // Try to find position
        const segIdx = findMatch();
        if (segIdx >= 0 && onMatchCallback) {
          onMatchCallback(segIdx, segments[segIdx]);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        console.warn('Speech recognition error:', event.error);
        // Auto-restart on non-fatal errors
        if (event.error === 'network' && isRunning) {
          setTimeout(() => {
            if (isRunning) {
              try { recognition.start(); } catch {}
            }
          }, 1000);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still running
        if (isRunning) {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
      isRunning = true;
      return true;
    } catch (e) {
      console.warn('Failed to start speech recognition:', e);
      return false;
    }
  }

  return {
    start,
    stop() {
      isRunning = false;
      stop();
      reset();
    },
    get isActive() { return isRunning; },
    get isSupported() { return !!SpeechRecognition; },
  };
}
