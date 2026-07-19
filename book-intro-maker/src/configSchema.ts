// 配置类型定义与运行时解析。
//
// 该模块负责把 `config/*.json` 里的原始数据解析成 Remotion 模板可以直接消费的
// 强类型结构。解析器都做了「容错 + 补默认值」处理：字段缺失或类型不对时退回到
// 合理默认值并打印告警，而不是直接抛错中断渲染。这样即使配置写坏了，样片能力
// 也不会被破坏。

export type Motif = 'portrait' | 'moon' | 'forest' | 'city' | 'waves' | 'shadow';

export type Palette = [string, string, string];

/** 开场层配置，对应 `config/intro.example.json`。 */
export type IntroConfig = {
  /** `video` 使用本地视频，`generated` 使用生成式背景。 */
  mode: 'video' | 'generated';
  /** 本地视频路径。相对路径按 Remotion `staticFile` 解析。 */
  videoPath: string | null;
  /** 生成式开场的背景图片覆盖。 */
  backgroundPath: string | null;
  /** 裁剪起点（秒）。 */
  trimStart: number;
  /** 裁剪终点（秒）。为 null 表示到视频结尾。 */
  trimEnd: number | null;
  /** 开场视频音量，0-1。 */
  volume: number;
  /** 是否静音开场视频。 */
  muted: boolean;
  /** 是否显示字幕轨道。 */
  showSubtitles: boolean;
  /** 开场底部角标，置空则不显示。 */
  brandText?: string;
};

/** 单本书的引用，对应 `config/books.example.json` 里的 `flashBooks` 元素。 */
export type BookRef = {
  title: string;
  author?: string;
  isbn?: string | null;
  /** 本地封面覆盖，优先级最高。相对路径按 `staticFile` 解析。 */
  coverPath?: string | null;
  /** 自定义封面检索关键字，覆盖默认的「书名 + 作者」。 */
  coverQuery?: string | null;
};

/** 主书引用，比普通书多了背景、主字幕、配色等字段。 */
export type MainBookRef = BookRef & {
  backgroundPath?: string | null;
  zhLine?: string;
  enLine?: string;
  palette?: Palette;
};

export type BooksConfig = {
  flashCutFrames: number[];
  flashBooks: BookRef[];
  mainBook: MainBookRef;
};

export type VisualAssetsConfig = {
  /** 快闪书封段背景图片覆盖。 */
  flashBackgroundPath: string | null;
};

export type SubtitlePosition = 'upper' | 'center' | 'lower';

export type SubtitleStyle = {
  zhColor: string;
  enColor: string;
  zhFontSize: number;
  enFontSize: number;
  zhFontWeight: number;
  enFontWeight: number;
  /** 文字阴影，作用于中英两行。 */
  shadow: string;
};

export type SubtitleItem = {
  id: string;
  startFrame: number;
  endFrame: number;
  zh?: string;
  en?: string;
  position: SubtitlePosition;
  style: SubtitleStyle;
};

export type SubtitlesConfig = {
  tracks: SubtitleItem[];
};

// —— 默认值 ——————————————————————————————————————————————————————————

export const DEFAULT_INTRO: IntroConfig = {
  mode: 'generated',
  videoPath: null,
  backgroundPath: null,
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  muted: false,
  showSubtitles: true,
  brandText: '@BookIntroMaker',
};

export const DEFAULT_VISUAL_ASSETS: VisualAssetsConfig = {
  flashBackgroundPath: null,
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  zhColor: '#ffe15a',
  enColor: '#ffffff',
  zhFontSize: 34,
  enFontSize: 16,
  zhFontWeight: 800,
  enFontWeight: 600,
  shadow: '0 2px 12px rgba(0,0,0,0.75)',
};

/** 配置书籍缺少配色/图形时按顺序分配的默认视觉，保证占位封面有区分度。 */
const DEFAULT_PALETTES: Palette[] = [
  ['#1b366d', '#5c8fe8', '#050814'],
  ['#c28a32', '#2b1a08', '#f5df9c'],
  ['#0c4c7c', '#e5d8b7', '#071b2a'],
  ['#9e171f', '#f0c0a5', '#210505'],
  ['#10337d', '#57aee7', '#061128'],
  ['#202020', '#b81321', '#e4d9c8'],
  ['#165aa5', '#efe0af', '#08223f'],
  ['#1e8ecd', '#b6e0ff', '#0a2f4a'],
];

const DEFAULT_MOTIFS: Motif[] = ['portrait', 'waves', 'moon', 'city', 'forest', 'shadow'];

export const paletteForIndex = (index: number): Palette => DEFAULT_PALETTES[index % DEFAULT_PALETTES.length];

export const motifForIndex = (index: number): Motif => DEFAULT_MOTIFS[index % DEFAULT_MOTIFS.length];

// —— 解析器 ——————————————————————————————————————————————————————————

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback: string, label: string): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value !== undefined && value !== null) {
    console.warn(`[config] ${label} 应为字符串，收到 ${typeof value}，已使用默认值`);
  }
  return fallback;
};

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asNumber = (value: unknown, fallback: number, label: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value !== undefined && value !== null) {
    console.warn(`[config] ${label} 应为数字，收到 ${JSON.stringify(value)}，已使用默认值 ${fallback}`);
  }
  return fallback;
};

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const parseIntroConfig = (raw: unknown): IntroConfig => {
  if (!isObject(raw)) {
    console.warn('[config] intro 配置不是对象，已回退到默认开场');
    return {...DEFAULT_INTRO};
  }
  const mode = raw.mode === 'video' ? 'video' : 'generated';
  if (raw.mode !== undefined && raw.mode !== 'video' && raw.mode !== 'generated') {
    console.warn(`[config] intro.mode 非法（${JSON.stringify(raw.mode)}），已回退到 generated`);
  }
  return {
    mode,
    videoPath: asNullableString(raw.videoPath),
    backgroundPath: asNullableString(raw.backgroundPath),
    trimStart: Math.max(0, asNumber(raw.trimStart, DEFAULT_INTRO.trimStart, 'intro.trimStart')),
    trimEnd:
      raw.trimEnd === null || raw.trimEnd === undefined
        ? null
        : Math.max(0, asNumber(raw.trimEnd, 0, 'intro.trimEnd')),
    volume: clamp(asNumber(raw.volume, DEFAULT_INTRO.volume, 'intro.volume'), 0, 1),
    muted: asBoolean(raw.muted, DEFAULT_INTRO.muted),
    showSubtitles: asBoolean(raw.showSubtitles, DEFAULT_INTRO.showSubtitles),
    brandText: typeof raw.brandText === 'string' ? raw.brandText : DEFAULT_INTRO.brandText,
  };
};

export const parseVisualAssetsConfig = (raw: unknown): VisualAssetsConfig => {
  if (!isObject(raw)) return {...DEFAULT_VISUAL_ASSETS};
  return {
    flashBackgroundPath: asNullableString(raw.flashBackgroundPath),
  };
};

const parseBookRef = (raw: unknown, index: number): BookRef => {
  if (!isObject(raw)) {
    console.warn(`[config] flashBooks[${index}] 不是对象，已跳过为占位书`);
    return {title: `未命名 ${index + 1}`};
  }
  return {
    title: asString(raw.title, `未命名 ${index + 1}`, `flashBooks[${index}].title`),
    author: asOptionalString(raw.author),
    isbn: asNullableString(raw.isbn),
    coverPath: asNullableString(raw.coverPath),
    coverQuery: asNullableString(raw.coverQuery),
  };
};

const parsePalette = (raw: unknown): Palette | undefined => {
  if (Array.isArray(raw) && raw.length === 3 && raw.every((c) => typeof c === 'string')) {
    return [raw[0], raw[1], raw[2]] as Palette;
  }
  return undefined;
};

const parseMainBook = (raw: unknown): MainBookRef => {
  if (!isObject(raw)) {
    console.warn('[config] mainBook 不是对象，已使用占位主书');
    return {title: '未命名主书'};
  }
  return {
    title: asString(raw.title, '未命名主书', 'mainBook.title'),
    author: asOptionalString(raw.author),
    isbn: asNullableString(raw.isbn),
    coverPath: asNullableString(raw.coverPath),
    coverQuery: asNullableString(raw.coverQuery),
    backgroundPath: asNullableString(raw.backgroundPath),
    zhLine: asOptionalString(raw.zhLine),
    enLine: asOptionalString(raw.enLine),
    palette: parsePalette(raw.palette),
  };
};

export const parseBooksConfig = (raw: unknown): BooksConfig => {
  if (!isObject(raw)) {
    console.warn('[config] books 配置不是对象，已回退到空书单 + 占位主书');
    return {flashCutFrames: [], flashBooks: [], mainBook: parseMainBook(undefined)};
  }
  const flashCutFrames = Array.isArray(raw.flashCutFrames)
    ? raw.flashCutFrames.filter((f): f is number => typeof f === 'number' && Number.isFinite(f))
    : [];
  if (flashCutFrames.length === 0) {
    console.warn('[config] books.flashCutFrames 为空，快闪段将被跳过');
  }
  const flashBooks = Array.isArray(raw.flashBooks)
    ? raw.flashBooks.map((book, index) => parseBookRef(book, index))
    : [];
  return {
    flashCutFrames,
    flashBooks,
    mainBook: parseMainBook(raw.mainBook),
  };
};

const parsePosition = (raw: unknown): SubtitlePosition => {
  if (raw === 'upper' || raw === 'center' || raw === 'lower') {
    return raw;
  }
  return 'lower';
};

const parseSubtitleStyle = (raw: unknown): SubtitleStyle => {
  if (!isObject(raw)) {
    return {...DEFAULT_SUBTITLE_STYLE};
  }
  return {
    zhColor: asString(raw.zhColor, DEFAULT_SUBTITLE_STYLE.zhColor, 'subtitle.style.zhColor'),
    enColor: asString(raw.enColor, DEFAULT_SUBTITLE_STYLE.enColor, 'subtitle.style.enColor'),
    zhFontSize: asNumber(raw.zhFontSize, DEFAULT_SUBTITLE_STYLE.zhFontSize, 'subtitle.style.zhFontSize'),
    enFontSize: asNumber(raw.enFontSize, DEFAULT_SUBTITLE_STYLE.enFontSize, 'subtitle.style.enFontSize'),
    zhFontWeight: asNumber(raw.zhFontWeight, DEFAULT_SUBTITLE_STYLE.zhFontWeight, 'subtitle.style.zhFontWeight'),
    enFontWeight: asNumber(raw.enFontWeight, DEFAULT_SUBTITLE_STYLE.enFontWeight, 'subtitle.style.enFontWeight'),
    shadow: asString(raw.shadow, DEFAULT_SUBTITLE_STYLE.shadow, 'subtitle.style.shadow'),
  };
};

const parseSubtitleItem = (raw: unknown, index: number): SubtitleItem | null => {
  if (!isObject(raw)) {
    console.warn(`[config] subtitles.tracks[${index}] 不是对象，已忽略`);
    return null;
  }
  const startFrame = asNumber(raw.startFrame, 0, `subtitles.tracks[${index}].startFrame`);
  const endFrame = asNumber(raw.endFrame, startFrame + 1, `subtitles.tracks[${index}].endFrame`);
  return {
    id: asString(raw.id, `subtitle-${index}`, `subtitles.tracks[${index}].id`),
    startFrame,
    endFrame: Math.max(endFrame, startFrame),
    zh: asOptionalString(raw.zh),
    en: asOptionalString(raw.en),
    position: parsePosition(raw.position),
    style: parseSubtitleStyle(raw.style),
  };
};

export const parseSubtitlesConfig = (raw: unknown): SubtitlesConfig => {
  if (!isObject(raw) || !Array.isArray(raw.tracks)) {
    console.warn('[config] subtitles 配置缺少 tracks 数组，字幕轨道为空');
    return {tracks: []};
  }
  const tracks = raw.tracks
    .map((track, index) => parseSubtitleItem(track, index))
    .filter((track): track is SubtitleItem => track !== null);
  return {tracks};
};
