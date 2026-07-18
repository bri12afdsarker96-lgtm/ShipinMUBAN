// 把批量数据行映射成二阶段的「原始三件套配置」{books, subtitles, intro}。
//
// 支持两种写法：
//   1. 结构化：行对象直接带 books / subtitles / intro 键（JSON 输入常用）。
//   2. 扁平字段：用下列列名（CSV 输入常用），本模块负责拼装。
//
// 扁平字段列名：
//   id
//   mainTitle, mainAuthor, mainIsbn, mainCover, mainBackground, mainZh, mainEn
//   flashBooks       "书名~作者~isbn | 书名~作者~isbn | ..."（作者/isbn 可省略）
//   flashCutFrames   "134|139|144|..."（可选，省略则按默认节奏自动生成）
//   introMode(video|generated), introVideo, introTrimStart, introTrimEnd,
//   introVolume, introMuted, showSubtitles
//   subtitles        "开始帧~结束帧~中文~英文~位置 ; ..."（可选）

const toBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
};

const toNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const nullableStr = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/** 自动卡点：按默认节奏生成快闪切点。最后一个切点即主书进入帧。 */
export const defaultCutFrames = (count, {start = 134, beat = 5} = {}) => {
  const beats = Math.max(count, 3) + 1;
  return Array.from({length: beats}, (_, i) => start + i * beat);
};

const parseFlashBooks = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  return String(value)
    .split('|')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [title, author, isbn] = entry.split('~').map((s) => s.trim());
      return {
        title: title || '未命名',
        author: author || undefined,
        isbn: isbn || null,
      };
    });
};

const parseSubtitleTracks = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object' && Array.isArray(value.tracks)) {
    return value.tracks;
  }
  if (!value) {
    return [];
  }
  return String(value)
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry, index) => {
      const [start, end, zh, en, position] = entry.split('~').map((s) => (s ?? '').trim());
      return {
        id: `sub-${index + 1}`,
        startFrame: toNumber(start, 0),
        endFrame: toNumber(end, toNumber(start, 0) + 30),
        zh: zh || undefined,
        en: en || undefined,
        position: position || 'lower',
      };
    });
};

const buildBooks = (row) => {
  if (row.books && typeof row.books === 'object') {
    return row.books;
  }
  const flashBooks = parseFlashBooks(row.flashBooks);
  const flashCutFrames = row.flashCutFrames
    ? String(row.flashCutFrames)
        .split('|')
        .map((n) => toNumber(n, null))
        .filter((n) => n !== null)
    : defaultCutFrames(flashBooks.length);

  return {
    flashCutFrames,
    flashBooks,
    mainBook: {
      title: row.mainTitle || row.title || '未命名主书',
      author: nullableStr(row.mainAuthor) || undefined,
      isbn: nullableStr(row.mainIsbn),
      coverPath: nullableStr(row.mainCover),
      backgroundPath: nullableStr(row.mainBackground),
      zhLine: nullableStr(row.mainZh) || undefined,
      enLine: nullableStr(row.mainEn) || undefined,
    },
  };
};

const buildIntro = (row) => {
  if (row.intro && typeof row.intro === 'object') {
    return row.intro;
  }
  return {
    mode: row.introMode === 'video' ? 'video' : 'generated',
    videoPath: nullableStr(row.introVideo),
    trimStart: toNumber(row.introTrimStart, 0),
    trimEnd: row.introTrimEnd ? toNumber(row.introTrimEnd, null) : null,
    volume: toNumber(row.introVolume, 1),
    muted: toBool(row.introMuted, false),
    showSubtitles: toBool(row.showSubtitles, true),
  };
};

const buildSubtitles = (row) => {
  if (row.subtitles && typeof row.subtitles === 'object' && !Array.isArray(row.subtitles)) {
    return row.subtitles;
  }
  return {tracks: parseSubtitleTracks(row.subtitles)};
};

/** 行 → {id, config:{books, subtitles, intro}}。 */
export const rowToConfig = (row, index) => {
  const id = String(row.id || row.slug || `video-${String(index + 1).padStart(2, '0')}`);
  return {
    id,
    template: row.template || 'classic',
    config: {
      books: buildBooks(row),
      subtitles: buildSubtitles(row),
      intro: buildIntro(row),
    },
  };
};
