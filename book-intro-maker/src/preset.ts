export type HookLine = {
  startFrame: number;
  endFrame: number;
  zh: string;
  en: string;
};

export type BookCard = {
  title: string;
  subtitle?: string;
  author?: string;
  palette: [string, string, string];
  motif: 'portrait' | 'moon' | 'forest' | 'city' | 'waves' | 'shadow';
};

export type MainBook = {
  title: string;
  author: string;
  zhLine: string;
  enLine: string;
  palette: [string, string, string];
};

export type BookIntroPreset = {
  title: string;
  hookLines: HookLine[];
  flashCutFrames: number[];
  bookCards: BookCard[];
  mainBook: MainBook;
};

export const samplePreset: BookIntroPreset = {
  title: 'Book Intro Maker V1',
  hookLines: [
    {
      startFrame: 8,
      endFrame: 45,
      zh: '这得是多干净的灵魂',
      en: 'What a clear soul',
    },
    {
      startFrame: 46,
      endFrame: 82,
      zh: '才有的觉悟',
      en: 'Only clear',
    },
    {
      startFrame: 83,
      endFrame: 112,
      zh: '今天分享',
      en: 'Share today',
    },
  ],
  flashCutFrames: [134, 142, 146, 151, 155, 160, 164, 169, 173, 178, 182, 187, 191, 195],
  bookCards: [
    {title: '我的虚无人生', author: '阿尔贝', palette: ['#e26a87', '#69d477', '#161915'], motif: 'forest'},
    {title: '了不起的盖茨比', author: '菲茨杰拉德', palette: ['#ffd22e', '#111111', '#5f4708'], motif: 'portrait'},
    {title: '瓦尔登湖', author: '梭罗', palette: ['#1e8ecd', '#b6e0ff', '#0a2f4a'], motif: 'waves'},
    {title: '悉达多', author: '黑塞', palette: ['#1b366d', '#5c8fe8', '#050814'], motif: 'forest'},
    {title: '远大前程', author: '狄更斯', palette: ['#e1aa20', '#2d1a07', '#f5d770'], motif: 'city'},
    {title: '月亮与六便士', author: '毛姆', palette: ['#0c225e', '#f7d33c', '#030814'], motif: 'moon'},
    {title: '呼啸山庄', author: '勃朗特', palette: ['#f1a64a', '#1f1511', '#071525'], motif: 'forest'},
    {title: '白渡', author: '余秋雨', palette: ['#10337d', '#57aee7', '#061128'], motif: 'city'},
    {title: '简爱', author: '夏洛蒂', palette: ['#165aa5', '#efe0af', '#08223f'], motif: 'portrait'},
    {title: '老人与海', author: '海明威', palette: ['#0c4c7c', '#e5d8b7', '#071b2a'], motif: 'waves'},
    {title: '一生', author: '莫泊桑', palette: ['#9e171f', '#f0c0a5', '#210505'], motif: 'portrait'},
    {title: '黑天鹅', author: '塔勒布', palette: ['#d7d7d7', '#151515', '#5b5b5b'], motif: 'shadow'},
    {title: '杀死一只知更鸟', author: '哈珀·李', palette: ['#202020', '#b81321', '#e4d9c8'], motif: 'shadow'},
  ],
  mainBook: {
    title: '屏蔽力',
    author: '自我边界练习',
    zhLine: '我不需要知道，别人在背后怎么议论我',
    enLine: 'I do not need to know what people say behind my back',
    palette: ['#c28a32', '#2b1a08', '#f5df9c'],
  },
};
