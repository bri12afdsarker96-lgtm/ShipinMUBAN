// 模板库（阶段三）。
//
// 每套模板 = 一组「视觉令牌」，驱动同一个 BookIntroVideo 渲染出可辨识的不同风格。
// 覆盖 phase-3-plan 里的模板类别：名著推荐 / 成长治愈 / 文学金句 / 短剧感开场。
//
// 模板只影响视觉（字体、配色、圆角、背景风格、卡片样式、暗角、文字色），不改变
// 卡点节奏与数据结构——节奏仍由 flashCutFrames（可自动生成/手动覆盖）控制。

export type MainBackgroundStyle = 'spines' | 'warm' | 'paper' | 'contrast';
export type CardStyle = 'cover' | 'quote';

export type TemplateTokens = {
  id: string;
  label: string;
  fontFamily: string;
  /** 强调色（快闪卡描边等）。 */
  accent: string;
  /** 快闪封面卡圆角。 */
  cardRadius: number;
  /** 快闪封面缺失时的降级卡样式：cover=图形封面，quote=金句卡。 */
  cardStyle: CardStyle;
  /** 主书页暗角强度 0..1。 */
  vignette: number;
  mainBackground: MainBackgroundStyle;
  mainTextColor: string;
  mainSubColor: string;
  mainQuoteColor: string;
};

export const DEFAULT_TEMPLATE_ID = 'classic';

export const TEMPLATES: Record<string, TemplateTokens> = {
  // 名著推荐 / 默认经典（等价于阶段二的原风格）。
  classic: {
    id: 'classic',
    label: '名著推荐',
    fontFamily: 'Georgia, "Times New Roman", "Songti SC", "Microsoft YaHei", serif',
    accent: '#ffe25d',
    cardRadius: 10,
    cardStyle: 'cover',
    vignette: 0.76,
    mainBackground: 'spines',
    mainTextColor: '#ffffff',
    mainSubColor: 'rgba(255,255,255,0.82)',
    mainQuoteColor: '#ffe25d',
  },
  // 成长治愈：暖色、大圆角、柔光。
  healing: {
    id: 'healing',
    label: '成长治愈',
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
    accent: '#ffd9a8',
    cardRadius: 28,
    cardStyle: 'cover',
    vignette: 0.5,
    mainBackground: 'warm',
    mainTextColor: '#fff6ec',
    mainSubColor: 'rgba(255,246,236,0.82)',
    mainQuoteColor: '#ffe7c8',
  },
  // 文学金句：纸质浅底、衬线、深色大字，弱化封面突出文字。
  quote: {
    id: 'quote',
    label: '文学金句',
    fontFamily: 'Georgia, "Songti SC", "Noto Serif SC", serif',
    accent: '#8a7a63',
    cardRadius: 6,
    cardStyle: 'quote',
    vignette: 0.32,
    mainBackground: 'paper',
    mainTextColor: '#2b2016',
    mainSubColor: 'rgba(43,32,22,0.7)',
    mainQuoteColor: '#7a3b1d',
  },
  // 短剧感开场：高对比黑红、直角、强暗角、亮黄字。
  drama: {
    id: 'drama',
    label: '短剧感开场',
    fontFamily: '"Impact", "Haettenschweiler", "Microsoft YaHei", sans-serif',
    accent: '#ff3b3b',
    cardRadius: 0,
    cardStyle: 'cover',
    vignette: 0.94,
    mainBackground: 'contrast',
    mainTextColor: '#ffffff',
    mainSubColor: 'rgba(255,255,255,0.86)',
    mainQuoteColor: '#ffe15a',
  },
};

export const getTemplate = (id?: string): TemplateTokens =>
  (id && TEMPLATES[id]) || TEMPLATES[DEFAULT_TEMPLATE_ID];

export const templateIds = (): string[] => Object.keys(TEMPLATES);
