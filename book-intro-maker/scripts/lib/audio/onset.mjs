// 音频瞬态（onset）检测 —— 时域能量新颖度法（无第三方依赖）。
//
// 思路：
//   1. 分帧计算对数能量包络。
//   2. 能量正向差分（half-wave rectified）得到「新颖度」曲线，突发瞬态处出现尖峰。
//   3. 自适应阈值 + 局部极大 + 最小间隔，拾取峰值作为 onset。
//
// 对卡点类音乐（鼓点/节拍明显）效果稳定；对氛围类音乐会给出较稀疏的结果。

export const detectOnsets = (samples, sampleRate, opts = {}) => {
  const hop = opts.hop || 512;
  const win = opts.win || 1024;
  const sensitivity = opts.sensitivity ?? 1.5;
  const thresholdWindow = opts.thresholdWindow || 12;
  const minGapSec = opts.minGapSec ?? 0.12;

  const nFrames = Math.max(0, Math.floor((samples.length - win) / hop) + 1);
  if (nFrames < 3) return [];

  // 1. 对数能量包络。
  const energy = new Float32Array(nFrames);
  for (let k = 0; k < nFrames; k++) {
    let e = 0;
    const start = k * hop;
    for (let n = 0; n < win; n++) {
      const v = samples[start + n] || 0;
      e += v * v;
    }
    energy[k] = Math.log(e / win + 1e-8);
  }

  // 2. 正向差分（新颖度）+ 3 点平滑。
  const flux = new Float32Array(nFrames);
  for (let k = 1; k < nFrames; k++) {
    const d = energy[k] - energy[k - 1];
    flux[k] = d > 0 ? d : 0;
  }
  const novelty = new Float32Array(nFrames);
  for (let k = 0; k < nFrames; k++) {
    novelty[k] = (flux[k - 1] || 0) * 0.25 + flux[k] * 0.5 + (flux[k + 1] || 0) * 0.25;
  }

  // 3. 自适应阈值 + 峰值拾取。
  const minGapFrames = Math.max(1, Math.round((minGapSec * sampleRate) / hop));
  const onsets = [];
  let last = -Infinity;
  for (let k = 1; k < nFrames - 1; k++) {
    let sum = 0;
    let cnt = 0;
    for (let j = k - thresholdWindow; j <= k + thresholdWindow; j++) {
      if (j >= 0 && j < nFrames) {
        sum += novelty[j];
        cnt++;
      }
    }
    const threshold = (sum / Math.max(1, cnt)) * sensitivity + 1e-4;
    const isPeak = novelty[k] >= novelty[k - 1] && novelty[k] > novelty[k + 1];
    if (isPeak && novelty[k] >= threshold && k - last >= minGapFrames) {
      onsets.push({time: (k * hop) / sampleRate, strength: novelty[k]});
      last = k;
    }
  }
  return onsets;
};

/** onset 时间（秒）转视频帧号（四舍五入到指定 fps）。 */
export const onsetsToFrames = (onsets, fps) => onsets.map((o) => Math.round(o.time * fps));

/**
 * 生成快闪卡点帧数组：在 [startSec, endSec] 内检测 onset，可选按强度取前 max 个，
 * 结果按帧号升序、去重。空结果由调用方回退到默认节奏。
 */
export const detectCutFrames = (samples, sampleRate, opts = {}) => {
  const fps = opts.fps || 30;
  const all = detectOnsets(samples, sampleRate, opts);
  let picked = all;
  if (opts.startSec != null || opts.endSec != null) {
    const s = opts.startSec ?? -Infinity;
    const e = opts.endSec ?? Infinity;
    picked = picked.filter((o) => o.time >= s && o.time <= e);
  }
  if (opts.max && picked.length > opts.max) {
    picked = [...picked].sort((a, b) => b.strength - a.strength).slice(0, opts.max);
  }
  const frames = Array.from(new Set(onsetsToFrames(picked, fps))).sort((a, b) => a - b);
  return frames;
};
