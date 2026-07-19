// 配置读取与模板 props 构建。
//
// 该模块把三个配置文件解析、组合成 `BookIntroProps`，供 Remotion 模板消费。
// 模板本身不再直接依赖写死的 `samplePreset`：
//   - `loadConfigProps()`  从 `config/*.example.json` 构建配置驱动的 props。
//   - `sampleProps`        从阶段一样片 `samplePreset` 适配而来，保留默认样片能力。
//
// 说明：这里只静态导入始终存在的 `*.example.json`。封面通过「约定路径 + 加载失败
// 降级」接入（见 `conventionCoverPath` 与 `CoverImage` 组件），因此模板永远不依赖
// 联网或 `books.resolved.json` 是否存在，缺封面也不会中断渲染。

import booksJson from '../config/books.example.json';
import introJson from '../config/intro.example.json';
import subtitlesJson from '../config/subtitles.example.json';
import {
  DEFAULT_INTRO,
  DEFAULT_VISUAL_ASSETS,
  DEFAULT_SUBTITLE_STYLE,
  motifForIndex,
  paletteForIndex,
  parseBooksConfig,
  parseIntroConfig,
  parseSubtitlesConfig,
  parseVisualAssetsConfig,
} from './configSchema';
import type {
  BookRef,
  BooksConfig,
  IntroConfig,
  Motif,
  Palette,
  SubtitleItem,
  SubtitlesConfig,
  VisualAssetsConfig,
} from './configSchema';
import {samplePreset} from './preset';
import type {HookLine} from './preset';

/** 快闪书封卡片的运行时数据。`coverPath` 为约定/覆盖路径，加载失败时退回图形绘制。 */
export type BookCoverCardData = {
  title: string;
  author?: string;
  coverPath: string | null;
  palette: Palette;
  motif: Motif;
};

/** 主书氛围页数据。 */
export type MainBookData = {
  title: string;
  author: string;
  zhLine: string;
  enLine: string;
  palette: Palette;
  coverPath: string | null;
  backgroundPath: string | null;
};

/** Remotion 模板统一消费的 props。 */
export type BookIntroProps = {
  title: string;
  /** 模板风格 id（见 templates.ts），缺省用默认模板。 */
  template?: string;
  /** 背景音乐路径（相对 public / 或 url），缺省用示例节拍。 */
  audio?: string;
  /** 调试：显示右上角时间码水印（默认关，避免烧进成片）。 */
  debug?: boolean;
  intro: IntroConfig;
  flashCutFrames: number[];
  bookCards: BookCoverCardData[];
  mainBook: MainBookData;
  subtitleTracks: SubtitleItem[];
  visualAssets: VisualAssetsConfig;
};

/** 默认背景音乐（阶段一示例节拍）。 */
export const DEFAULT_AUDIO = 'sample-beat.wav';

// —— 封面路径约定 ————————————————————————————————————————————————————
// 注意：下面的 slug 逻辑必须与 `scripts/fetch-covers.mjs` 保持一致，
// 否则模板算出的约定路径会和脚本下载的文件名对不上。

export const coverSlug = (value: string): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** 根据书籍信息推导封面在 `public/covers/` 下的约定路径。 */
export const conventionCoverPath = (book: {isbn?: string | null; title: string; author?: string}): string => {
  const key = book.isbn || `${book.title}-${book.author || ''}`;
  return `covers/${coverSlug(key)}.jpg`;
};

/** 优先使用显式本地覆盖，否则回退到约定路径。 */
const resolveCoverPath = (book: BookRef): string =>
  book.coverPath && book.coverPath.length > 0 ? book.coverPath : conventionCoverPath(book);

// —— 从配置构建 props ————————————————————————————————————————————————

export const buildPropsFromConfig = (
  books: BooksConfig,
  subtitles: SubtitlesConfig,
  intro: IntroConfig,
  visualAssets: VisualAssetsConfig = {...DEFAULT_VISUAL_ASSETS},
): BookIntroProps => {
  const bookCards: BookCoverCardData[] = books.flashBooks.map((book, index) => ({
    title: book.title,
    author: book.author,
    coverPath: resolveCoverPath(book),
    palette: paletteForIndex(index),
    motif: motifForIndex(index),
  }));

  const main = books.mainBook;
  const mainBook: MainBookData = {
    title: main.title,
    author: main.author ?? '',
    zhLine: main.zhLine ?? '',
    enLine: main.enLine ?? '',
    palette: main.palette ?? paletteForIndex(bookCards.length),
    coverPath: resolveCoverPath(main),
    backgroundPath: main.backgroundPath ?? null,
  };

  return {
    title: 'Book Intro (config)',
    intro,
    flashCutFrames: books.flashCutFrames,
    bookCards,
    mainBook,
    subtitleTracks: subtitles.tracks,
    visualAssets,
  };
};

/** 从 `config/*.example.json` 加载配置驱动的 props。 */
export const loadConfigProps = (): BookIntroProps =>
  buildPropsFromConfig(
    parseBooksConfig(booksJson),
    parseSubtitlesConfig(subtitlesJson),
    parseIntroConfig(introJson),
    parseVisualAssetsConfig(undefined),
  );

/** 原始（未解析）三件套配置。批量生产每条视频以此作为 inputProps。 */
export type RawConfigInput = {
  template?: unknown;
  audio?: unknown;
  debug?: unknown;
  books?: unknown;
  subtitles?: unknown;
  intro?: unknown;
  visualAssets?: unknown;
};

/** 示例三件套原始配置，作为 `BookIntroFromConfig` 的默认 props。 */
export const rawExampleConfig: RawConfigInput = {
  template: 'classic',
  audio: DEFAULT_AUDIO,
  books: booksJson,
  subtitles: subtitlesJson,
  intro: introJson,
  visualAssets: {...DEFAULT_VISUAL_ASSETS},
};

/**
 * 从原始三件套构建模板 props。缺省的部分回退到示例配置，保证任意子集都能渲染。
 * 映射/解析逻辑集中在这里，批量脚本只需提供原始配置即可，无需重复实现。
 */
export const propsFromRaw = (raw: RawConfigInput): BookIntroProps => ({
  ...buildPropsFromConfig(
    parseBooksConfig(raw?.books ?? booksJson),
    parseSubtitlesConfig(raw?.subtitles ?? subtitlesJson),
    parseIntroConfig(raw?.intro ?? introJson),
    parseVisualAssetsConfig(raw?.visualAssets),
  ),
  template: typeof raw?.template === 'string' ? raw.template : undefined,
  audio: typeof raw?.audio === 'string' ? raw.audio : undefined,
  debug: raw?.debug === true,
});

/** 根据 props 推算合适时长：主书页至少留 45 帧尾巴，字幕留 15 帧，最少 240 帧。 */
export const durationForProps = (props: BookIntroProps): number => {
  const lastCut = props.flashCutFrames[props.flashCutFrames.length - 1] ?? 0;
  const lastSubtitle = props.subtitleTracks.reduce((max, t) => Math.max(max, t.endFrame), 0);
  return Math.max(240, lastCut + 45, lastSubtitle + 15);
};

// —— 阶段一样片适配 ——————————————————————————————————————————————————

/** 把阶段一的开场钩子字幕转换成独立字幕轨道，保持样片视觉一致。 */
const hookLinesToTracks = (lines: HookLine[]): SubtitleItem[] =>
  lines.map((line, index) => ({
    id: `hook-${index + 1}`,
    startFrame: line.startFrame,
    endFrame: line.endFrame,
    zh: line.zh,
    en: line.en,
    position: 'lower' as const,
    style: {...DEFAULT_SUBTITLE_STYLE},
  }));

/** 把阶段一 `samplePreset` 适配成统一 props，保留默认样片能力（纯生成式封面）。 */
export const sampleProps: BookIntroProps = {
  title: samplePreset.title,
  template: 'classic',
  audio: DEFAULT_AUDIO,
  intro: {...DEFAULT_INTRO},
  flashCutFrames: samplePreset.flashCutFrames,
  bookCards: samplePreset.bookCards.map((card) => ({
    title: card.title,
    author: card.author,
    coverPath: null,
    palette: card.palette,
    motif: card.motif,
  })),
  mainBook: {
    title: samplePreset.mainBook.title,
    author: samplePreset.mainBook.author,
    zhLine: samplePreset.mainBook.zhLine,
    enLine: samplePreset.mainBook.enLine,
    palette: samplePreset.mainBook.palette,
    coverPath: null,
    backgroundPath: null,
  },
  subtitleTracks: hookLinesToTracks(samplePreset.hookLines),
  visualAssets: {...DEFAULT_VISUAL_ASSETS},
};
