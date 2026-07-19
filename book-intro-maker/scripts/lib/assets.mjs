// 素材库（阶段三）。
//
// 统一登记封面 / 背景 / 开场视频 / 音乐 / 字幕样式，配置里用 `asset:<id>` 引用，
// 批量映射后由本模块把引用替换成真实路径或样式对象。渲染层无需感知素材库。
//
// 分类与引用字段：
//   audio          -> 顶层 audio
//   covers         -> books.flashBooks[].coverPath / mainBook.coverPath
//   backgrounds    -> mainBook.backgroundPath / intro.backgroundPath / visualAssets.flashBackgroundPath
//   introVideos    -> intro.videoPath
//   subtitleStyles -> subtitles.tracks[].style（字符串引用 -> 样式对象）

import {readFileSync, existsSync} from 'node:fs';

export const loadAssets = (filePath) => {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
};

const refId = (value) => (typeof value === 'string' && value.startsWith('asset:') ? value.slice('asset:'.length) : null);

const resolvePath = (assets, category, value) => {
  const id = refId(value);
  if (!id) return value; // 非 asset: 引用，原样保留（直接路径）。
  const entry = assets[category]?.[id];
  if (!entry) {
    console.warn(`[assets] 未找到 ${category}:${id}，置空（渲染将降级）`);
    return null;
  }
  return typeof entry === 'string' ? entry : entry.path ?? null;
};

/** 就地解析一个 job 内的所有素材引用。assets 为空时原样返回。 */
export const resolveAssetsInJob = (job, assets) => {
  if (!assets) return job;
  const c = job.config || {};

  if (refId(job.audio)) job.audio = resolvePath(assets, 'audio', job.audio);

  const books = c.books || {};
  for (const b of books.flashBooks || []) {
    if (refId(b.coverPath)) b.coverPath = resolvePath(assets, 'covers', b.coverPath);
  }
  const mb = books.mainBook;
  if (mb) {
    if (refId(mb.coverPath)) mb.coverPath = resolvePath(assets, 'covers', mb.coverPath);
    if (refId(mb.backgroundPath)) mb.backgroundPath = resolvePath(assets, 'backgrounds', mb.backgroundPath);
  }

  if (c.intro && refId(c.intro.videoPath)) c.intro.videoPath = resolvePath(assets, 'introVideos', c.intro.videoPath);
  if (c.intro && refId(c.intro.backgroundPath)) c.intro.backgroundPath = resolvePath(assets, 'backgrounds', c.intro.backgroundPath);
  if (c.visualAssets && refId(c.visualAssets.flashBackgroundPath)) {
    c.visualAssets.flashBackgroundPath = resolvePath(assets, 'backgrounds', c.visualAssets.flashBackgroundPath);
  }

  for (const t of c.subtitles?.tracks || []) {
    if (typeof t.style === 'string') {
      const preset = assets.subtitleStyles?.[t.style];
      if (preset) {
        t.style = {...preset};
      } else {
        console.warn(`[assets] 未找到 subtitleStyle:${t.style}，使用默认样式`);
        delete t.style;
      }
    }
  }

  return job;
};
