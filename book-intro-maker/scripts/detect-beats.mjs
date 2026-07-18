// 音乐瞬态自动卡点 CLI。
//
// 解码音频，检测瞬态，输出 30fps 下的快闪卡点帧，可直接填入 books 配置的 flashCutFrames。
//
// 用法：
//   node scripts/detect-beats.mjs                                   # 默认 public/sample-beat.wav 全段
//   node scripts/detect-beats.mjs --audio public/sample-beat.wav --start 4 --end 7
//   node scripts/detect-beats.mjs --audio beat.wav --max 14 --out config/cuts.json
//
// 参数：
//   --audio <wav>     音频文件（默认 public/sample-beat.wav）
//   --fps <n>         视频帧率（默认 30）
//   --start <sec>     只取该秒之后的切点
//   --end <sec>       只取该秒之前的切点
//   --max <n>         最多保留 n 个（按瞬态强度取前 n）
//   --min-gap <sec>   相邻切点最小间隔（默认 0.12）
//   --sensitivity <n> 阈值灵敏度（默认 1.5，越大越严格）
//   --out <file>      写出 {flashCutFrames, times} JSON
//   --print           打印每个切点的帧与秒

import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {decodeWav} from './lib/audio/wav.mjs';
import {detectOnsets, onsetsToFrames} from './lib/audio/onset.mjs';

const parseArgs = (argv) => {
  const a = {audio: 'public/sample-beat.wav', fps: 30, minGap: 0.12, sensitivity: 1.5};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--audio') a.audio = argv[++i];
    else if (k === '--fps') a.fps = Number(argv[++i]);
    else if (k === '--start') a.start = Number(argv[++i]);
    else if (k === '--end') a.end = Number(argv[++i]);
    else if (k === '--max') a.max = Number(argv[++i]);
    else if (k === '--min-gap') a.minGap = Number(argv[++i]);
    else if (k === '--sensitivity') a.sensitivity = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--print') a.print = true;
  }
  return a;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const audioPath = path.resolve(root, args.audio);

  const {sampleRate, samples, duration} = decodeWav(readFileSync(audioPath));
  let onsets = detectOnsets(samples, sampleRate, {
    sensitivity: args.sensitivity,
    minGapSec: args.minGap,
  });
  if (args.start != null) onsets = onsets.filter((o) => o.time >= args.start);
  if (args.end != null) onsets = onsets.filter((o) => o.time <= args.end);
  if (args.max && onsets.length > args.max) {
    onsets = [...onsets].sort((x, y) => y.strength - x.strength).slice(0, args.max);
  }
  onsets.sort((x, y) => x.time - y.time);

  const frames = Array.from(new Set(onsetsToFrames(onsets, args.fps))).sort((x, y) => x - y);
  const times = onsets.map((o) => Number(o.time.toFixed(3)));

  console.log(`音频：${path.relative(root, audioPath)}  时长 ${duration.toFixed(2)}s  采样率 ${sampleRate}`);
  console.log(`检测到 ${frames.length} 个切点（fps=${args.fps}）`);
  console.log(`flashCutFrames: ${JSON.stringify(frames)}`);
  if (args.print) {
    onsets.forEach((o, i) => console.log(`  #${i + 1}  ${o.time.toFixed(3)}s  -> 帧 ${Math.round(o.time * args.fps)}  强度 ${o.strength.toFixed(3)}`));
  }
  if (args.out) {
    const outPath = path.resolve(root, args.out);
    writeFileSync(outPath, `${JSON.stringify({audio: path.relative(root, audioPath), fps: args.fps, flashCutFrames: frames, times}, null, 2)}\n`, 'utf8');
    console.log(`已写出：${path.relative(root, outPath)}`);
  }
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
