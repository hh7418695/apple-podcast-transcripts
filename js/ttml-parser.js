function parseTimestamp(attr) {
  if (!attr) return null;
  // TTML format: HH:MM:SS.mmm or HH:MM:SS,mmm or MM:SS.mmm
  const parts = attr.split(':');
  if (parts.length === 2) {
    // MM:SS.mmm
    const secPart = parts[1].replace(',', '.');
    return parseInt(parts[0], 10) * 60 + parseFloat(secPart);
  }
  if (parts.length === 3) {
    const secPart = parts[2].replace(',', '.');
    return parseInt(parts[0], 10) * 3600 +
      parseInt(parts[1], 10) * 60 +
      parseFloat(secPart);
  }
  // Try raw seconds
  const num = parseFloat(attr.replace(',', '.'));
  if (!isNaN(num)) return num;
  return null;
}

/** Get begin/end from an element, trying multiple attribute names */
function getTiming(el) {
  let begin = parseTimestamp(el.getAttribute('begin'));
  if (begin == null) begin = parseTimestamp(el.getAttribute('xml:begin'));
  let end = parseTimestamp(el.getAttribute('end'));
  if (end == null) end = parseTimestamp(el.getAttribute('xml:end'));
  return { begin, end };
}

export async function extractPodcastTranscripts(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(reader.result, 'application/xml');
      const body = xmlDoc.querySelector('body');
      const match = file.name.match(/(\d+)/);
      const podcastId = match ? match[1] : null;
      if (!body || !podcastId) return resolve({});

      let hasAnyTiming = false;
      const podcastChunks = [];

      for (const chunk of xmlDoc.querySelectorAll('p')) {
        const speaker = chunk.getAttribute('ttm:agent');
        const chunkTiming = getTiming(chunk);

        // Also try parent <div> for timing
        if (chunkTiming.begin == null) {
          const parentDiv = chunk.closest('div');
          if (parentDiv) {
            const divTiming = getTiming(parentDiv);
            if (divTiming.begin != null) {
              chunkTiming.begin = divTiming.begin;
              chunkTiming.end = divTiming.end;
            }
          }
        }

        if (chunkTiming.begin != null) hasAnyTiming = true;

        const segments = [];
        const sentenceSpans = [...chunk.querySelectorAll('span')]
          .filter(sp => sp.getAttribute('podcasts:unit') === 'sentence');

        for (const sentence of sentenceSpans) {
          const text = [...sentence.querySelectorAll('span')]
            .map(sp => sp.textContent)
            .join(' ');
          const segTiming = getTiming(sentence);
          // Fallback to paragraph timing if sentence has none
          const begin = segTiming.begin != null ? segTiming.begin : chunkTiming.begin;
          const end = segTiming.end != null ? segTiming.end : chunkTiming.end;
          segments.push({ text, begin, end });
        }

        // If no sentence-level spans found, treat the whole paragraph as one segment
        if (segments.length === 0) {
          const text = chunk.textContent?.trim();
          if (text) {
            segments.push({
              text,
              begin: chunkTiming.begin,
              end: chunkTiming.end,
            });
          }
        }

        const sentences = segments.map(s => s.text).join(' ');
        podcastChunks.push({
          speaker,
          sentences,
          begin: chunkTiming.begin,
          end: chunkTiming.end,
          segments,
        });
      }

      if (!hasAnyTiming) {
        console.warn('No timing data found in TTML file:', file.name,
          '— transcript sync and SRT/VTT export will be unavailable.');
      }

      resolve({ [podcastId]: { podcastChunks, lastModified: file.lastModified } });
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
