const REQUIRED_EPISODE_COLUMNS = [
  'ZSTORETRACKID',
  'ZAUTHOR',
  'ZCLEANEDTITLE',
  'ZITUNESSUBTITLE',
  'ZDURATION',
];

function openPodcastDatabase(SQL, relevantFiles) {
  if (relevantFiles.mainDB && relevantFiles.walFile) {
    return new SQL.Database(new Uint8Array(relevantFiles.mainDB), new Uint8Array(relevantFiles.walFile));
  }
  if (relevantFiles.mainDB) {
    return new SQL.Database(new Uint8Array(relevantFiles.mainDB));
  }
  return null;
}

function getPodcastStoreIds(db, hasPodcastId) {
  const podcastStoreIds = {};
  if (!hasPodcastId) return podcastStoreIds;

  try {
    const podcastTables = db.exec('PRAGMA table_info(ZMTPODCAST);');
    if (podcastTables.length > 0) {
      const podcastCols = new Set(podcastTables[0].values.map(v => v[1]));
      if (podcastCols.has('ZSTORETRACKID')) {
        const podcastData = db.exec('SELECT Z_PK, ZSTORETRACKID FROM ZMTPODCAST;');
        if (podcastData.length > 0) {
          for (const row of podcastData[0].values) {
            podcastStoreIds[row[0]] = row[1];
          }
        }
      }
    }
  } catch (e) {
    console.warn('Could not fetch podcast IDs:', e);
  }

  return podcastStoreIds;
}

function queryEpisodeMetadata(db, transcriptIds) {
  if (transcriptIds.length === 0) return { transcriptsMap: {}, warningMessage: '' };

  try {
    const tableInfo = db.exec('PRAGMA table_info(ZMTEPISODE);');
    const episodeColumns = tableInfo[0]?.values || [];
    if (episodeColumns.length === 0) {
      console.warn('Incompatible Apple Podcasts metadata schema: missing ZMTEPISODE table.');
      return {
        transcriptsMap: {},
        warningMessage: 'This SQLite database does not contain the Apple Podcasts episode table, so episode metadata was skipped. Transcript text is still shown with fallback metadata.',
      };
    }

    const columns = new Set(episodeColumns.map(v => v[1]));
    const missingColumns = REQUIRED_EPISODE_COLUMNS.filter(column => !columns.has(column));
    if (missingColumns.length > 0) {
      console.warn('Incompatible Apple Podcasts metadata schema: missing required ZMTEPISODE columns.', missingColumns);
      return {
        transcriptsMap: {},
        warningMessage: 'This SQLite database uses an unsupported Apple Podcasts schema, so episode metadata was skipped. Transcript text is still shown with fallback metadata.',
      };
    }

    const hasTime = columns.has('ZFIRSTTIMEAVAILABLE');
    const hasAssetUrl = columns.has('ZASSETURL');
    const hasEnclosureUrl = columns.has('ZENCLOSUREURL');
    const hasPodcastId = columns.has('ZPODCAST');
    const podcastStoreIds = getPodcastStoreIds(db, hasPodcastId);
    const transcriptsMap = {};

    const podcastInfo = db.exec(
      `SELECT
        ZSTORETRACKID,
        ZAUTHOR,
        ZCLEANEDTITLE,
        ZITUNESSUBTITLE,
        ZDURATION
        ${hasTime ? ', ZFIRSTTIMEAVAILABLE' : ''}
        ${hasAssetUrl ? ', ZASSETURL' : ''}
        ${hasEnclosureUrl ? ', ZENCLOSUREURL' : ''}
        ${hasPodcastId ? ', ZPODCAST' : ''}
      FROM ZMTEPISODE
      WHERE ZSTORETRACKID IN (${transcriptIds.join(', ')});`
    );

    if (podcastInfo.length > 0) {
      for (const pod of podcastInfo[0].values) {
        let idx = 5;
        const episodeId = pod[0];
        let firstTimeAvailable = null;
        let audioUrl = null;
        let appleLink = null;

        if (hasTime) {
          firstTimeAvailable = pod[idx];
          idx++;
        }

        if (hasAssetUrl && pod[idx]) {
          audioUrl = pod[idx];
        }
        idx = hasAssetUrl ? idx + 1 : idx;

        if (!audioUrl && hasEnclosureUrl && pod[idx]) {
          audioUrl = pod[idx];
        }
        idx = hasEnclosureUrl ? idx + 1 : idx;

        if (hasPodcastId && pod[idx]) {
          const podcastPK = pod[idx];
          const podcastStoreId = podcastStoreIds[podcastPK];
          if (podcastStoreId) {
            appleLink = `https://podcasts.apple.com/podcast/id${podcastStoreId}?i=${episodeId}`;
          }
        }

        if (!appleLink && episodeId) {
          appleLink = `https://podcasts.apple.com/podcast/episode/id${episodeId}`;
        }

        transcriptsMap[episodeId] = {
          author: pod[1],
          title: pod[2],
          description: pod[3],
          duration: pod[4],
          time: hasTime && firstTimeAvailable ? firstTimeAvailable + 978307200 : -1,
          audioUrl,
          appleLink,
        };
      }
    }

    return { transcriptsMap, warningMessage: '' };
  } catch (e) {
    console.warn('Incompatible Apple Podcasts metadata schema: could not read podcast metadata database.', e);
    return {
      transcriptsMap: {},
      warningMessage: 'This SQLite database could not be read as an Apple Podcasts library, so episode metadata was skipped. Transcript text is still shown with fallback metadata.',
    };
  }
}

export function buildTranscriptMetadata(SQL, relevantFiles) {
  let db = null;
  let warningMessage = '';
  let transcriptsMap = {};

  try {
    db = openPodcastDatabase(SQL, relevantFiles);
  } catch (e) {
    warningMessage = 'The SQLite database could not be opened, so episode metadata was skipped. Transcript text will still load from the transcript files.';
    console.warn('Could not open podcast metadata database:', e);
  }

  if (db) {
    const keys = Object.keys(relevantFiles.transcripts).filter(k => /^\d+$/.test(k));
    const metadataResult = queryEpisodeMetadata(db, keys);
    transcriptsMap = metadataResult.transcriptsMap;
    warningMessage = metadataResult.warningMessage;
  }

  for (const podcastId in relevantFiles.transcripts) {
    const chunks = relevantFiles.transcripts[podcastId].podcastChunks;
    const lastModified = relevantFiles.transcripts[podcastId].lastModified;
    if (podcastId in transcriptsMap) {
      transcriptsMap[podcastId].transcripts = chunks;
      transcriptsMap[podcastId].lastModified = lastModified;
    } else {
      transcriptsMap[podcastId] = {
        author: 'Unknown',
        title: 'Unknown',
        description: '',
        duration: -1,
        time: -1,
        transcripts: chunks,
        lastModified,
      };
    }

    if (podcastId in relevantFiles.audioFiles) {
      transcriptsMap[podcastId].audioFile = relevantFiles.audioFiles[podcastId];
    }
  }

  const transcripts = Object.values(transcriptsMap)
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  return { transcripts, warningMessage };
}
