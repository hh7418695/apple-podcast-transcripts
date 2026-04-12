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

      const podcastChunks = [];
      for (const chunk of xmlDoc.querySelectorAll('p')) {
        const speaker = chunk.getAttribute('ttm:agent');
        const sentences = [...chunk.querySelectorAll('span')]
          .filter(sp => sp.getAttribute('podcasts:unit') === 'sentence')
          .map(sentence => [...sentence.querySelectorAll('span')].map(sp => sp.textContent).join(' '))
          .join(' ');
        podcastChunks.push({ speaker, sentences });
      }
      resolve({ [podcastId]: { podcastChunks, lastModified: file.lastModified } });
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
