// 自动质检：在渲染前后检查每条视频，产出分级问题清单。
//   error   会阻断渲染（该条标记 qc-failed）。
//   warning 记录但继续（可能影响观感，如字幕溢出）。
//   info    提示信息（如封面缺失，会自动降级为生成式封面）。
import {existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {conventionCoverPath} from '../../lib/cover-path.mjs';

const VIDEO_WIDTH = 720;
const SIDE_MARGIN = 56; // 与 SubtitleTrack / 主书字幕左右边距一致。
const SAFE_WIDTH = VIDEO_WIDTH - SIDE_MARGIN * 2;

// 单行文本估算宽度：中文约 1 字 1 字号；英文约 0.55 字号/字符。
const estimateWidth = (text, fontSize, cjk) => text.length * fontSize * (cjk ? 1 : 0.55);

const coverExists = (root, book) => {
  if (book.coverPath) {
    // 本地覆盖：相对 public 解析。
    const rel = String(book.coverPath).replace(/^public\//, '').replace(/^\/+/, '');
    return existsSync(path.join(root, 'public', rel));
  }
  return existsSync(path.join(root, 'public', conventionCoverPath(book)));
};

const publicAssetExists = (root, value) => {
  if (!value) return true;
  const rel = String(value).replace(/^public[\\/]/, '').replace(/^\/+/, '');
  if (/^(https?:|data:|blob:)/i.test(rel)) return true;
  return existsSync(path.join(root, 'public', rel));
};

/** 渲染前静态质检。返回 {errors, warnings, infos}。 */
export const runQc = (job, root) => {
  const errors = [];
  const warnings = [];
  const infos = [];
  const {books, subtitles} = job.config;
  const intro = job.config.intro || {};
  const visualAssets = job.config.visualAssets || {};
  const main = books.mainBook || {};

  // 必填。
  if (!main.title || String(main.title).trim() === '') {
    errors.push('主书标题为空');
  }
  if (!Array.isArray(books.flashBooks) || books.flashBooks.length === 0) {
    warnings.push('没有快闪书单，将只渲染开场与主书');
  }

  // 快闪切点。
  const cuts = books.flashCutFrames || [];
  if (cuts.length >= 2) {
    const increasing = cuts.every((v, i) => i === 0 || v > cuts[i - 1]);
    if (!increasing) {
      warnings.push('flashCutFrames 非严格递增，卡点可能异常');
    }
  }

  // 字幕溢出（独立字幕轨道）。
  for (const t of subtitles?.tracks || []) {
    const zhSize = t.style?.zhFontSize ?? 34;
    const enSize = t.style?.enFontSize ?? 16;
    if (t.zh && estimateWidth(t.zh, zhSize, true) > SAFE_WIDTH) {
      warnings.push(`字幕 ${t.id || ''} 中文可能溢出（${t.zh.length} 字 @ ${zhSize}px）`);
    }
    if (t.en && estimateWidth(t.en, enSize, false) > SAFE_WIDTH) {
      warnings.push(`字幕 ${t.id || ''} 英文可能溢出`);
    }
  }
  // 主书主字幕（模板固定 zh29 / en15）。
  if (main.zhLine && estimateWidth(main.zhLine, 29, true) > SAFE_WIDTH) {
    warnings.push(`主书中文字幕可能溢出（${main.zhLine.length} 字）`);
  }

  // 背景音乐存在性。
  const audioRel = String(job.audio || 'sample-beat.wav').replace(/^public\//, '').replace(/^\/+/, '');
  if (!/^(https?:|data:)/i.test(audioRel) && !existsSync(path.join(root, 'public', audioRel))) {
    warnings.push(`背景音乐缺失（${audioRel}），视频将没有节拍音频`);
  }

  if (intro.mode === 'video' && intro.videoPath && !publicAssetExists(root, intro.videoPath)) {
    errors.push(`开场视频不存在（${intro.videoPath}）`);
  }
  if (intro.backgroundPath && !publicAssetExists(root, intro.backgroundPath)) {
    infos.push(`开场背景缺失将降级为生成式背景：${intro.backgroundPath}`);
  }
  if (visualAssets.flashBackgroundPath && !publicAssetExists(root, visualAssets.flashBackgroundPath)) {
    infos.push(`快闪背景缺失将降级为模板背景：${visualAssets.flashBackgroundPath}`);
  }
  if (main.backgroundPath && !publicAssetExists(root, main.backgroundPath)) {
    infos.push(`主书背景缺失将降级为模板背景：${main.backgroundPath}`);
  }

  // 封面存在性（缺失会降级，仅提示）。
  const missing = [];
  for (const book of books.flashBooks || []) {
    if (!coverExists(root, book)) missing.push(book.title);
  }
  if (!coverExists(root, main)) missing.push(`${main.title}(主书)`);
  if (missing.length > 0) {
    infos.push(`封面缺失将降级为生成式占位：${missing.join('、')}`);
  }

  return {errors, warnings, infos};
};

/** 渲染后质检：输出文件存在且非空。 */
export const runPostQc = (outputPath) => {
  const errors = [];
  if (!existsSync(outputPath)) {
    errors.push('输出文件不存在');
    return {errors};
  }
  if (statSync(outputPath).size === 0) {
    errors.push('输出文件为空（0 字节）');
  }
  return {errors};
};
