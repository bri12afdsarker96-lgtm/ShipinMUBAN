// 批量核心：CLI（render-batch）与本地服务队列共用。
//
// 负责「行 -> 三件套配置 -> 素材解析 -> 自动卡点 -> 质检 -> 队列渲染」的完整编排，
// 通过 onProgress 回调实时上报每条状态（供服务端队列进度轮询）。

import {mkdir, stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {rowToConfig} from './row-to-config.mjs';
import {resolveAssetsInJob} from '../../lib/assets.mjs';
import {decodeWav} from '../../lib/audio/wav.mjs';
import {detectCutFrames} from '../../lib/audio/onset.mjs';
import {runQc, runPostQc} from './qc.mjs';
import {runPool} from './pool.mjs';
import {getBundle, renderJob} from './render-core.mjs';

/** 行数组 -> 已解析素材、已自动卡点的 job 数组（不渲染）。 */
export const prepareJobs = (rows, {root, assets}) => {
  const jobs = rows.map((row, i) => rowToConfig(row, i));
  if (assets) {
    for (const job of jobs) resolveAssetsInJob(job, assets);
  }
  for (const job of jobs) {
    if (!job.beats) continue;
    try {
      const audioPath = path.resolve(root, job.beats.audio);
      const {sampleRate, samples} = decodeWav(readFileSync(audioPath));
      const frames = detectCutFrames(samples, sampleRate, {
        fps: 30,
        startSec: job.beats.startSec,
        endSec: job.beats.endSec,
        max: job.beats.max,
        sensitivity: job.beats.sensitivity,
      });
      if (frames.length >= 2) {
        job.config.books.flashCutFrames = frames;
        console.log(`[卡点] ${job.id}：自动检测 ${frames.length} 个切点`);
      } else {
        console.warn(`[卡点] ${job.id}：检测结果过少（${frames.length}），保留原切点`);
      }
    } catch (error) {
      console.warn(`[卡点] ${job.id}：音频检测失败（${error.message}），保留原切点`);
    }
  }
  return jobs;
};

/**
 * 队列渲染 rows。onProgress({index, id, status, qc, output, bytes, ms, error}) 会在
 * 每条状态变化时调用（status: queued/rendering/rendered/failed/qc-failed）。
 * 返回最终 records 数组。
 */
export const runBatch = async ({rows, root, assets, browserExecutable, concurrency = 1, retries = 1, outDir, onProgress = () => {}}) => {
  const jobs = prepareJobs(rows, {root, assets});
  await mkdir(outDir, {recursive: true});
  const serveUrl = await getBundle(root);

  const prepared = jobs.map((job) => ({job, qc: runQc(job, root)}));
  prepared.forEach(({job, qc}, index) =>
    onProgress({index, id: job.id, status: qc.errors.length ? 'qc-failed' : 'queued', qc: {errors: qc.errors, warnings: qc.warnings, infos: qc.infos}}),
  );

  const records = await runPool(
    prepared,
    async ({job, qc}, index) => {
      const qcObj = {errors: qc.errors, warnings: qc.warnings, infos: qc.infos};
      const base = {index, id: job.id, template: job.template, qc: qcObj};

      if (qc.errors.length) {
        const rec = {...base, status: 'qc-failed'};
        onProgress(rec);
        return rec;
      }
      // 隔离单条异常：worker 内任何一步意外抛错都转成 failed 记录，
      // 绝不冒泡到 runPool（否则 Promise.all reject 会让整批崩溃、已完成记录与归档全丢）。
      try {
        onProgress({...base, status: 'rendering'});

        // 纵深防御：文件名再过滤路径字符，并以 index 保证唯一（防同 id 互相覆盖）。
        const safeName = String(job.id).replace(/[^a-zA-Z0-9一-龥_-]+/g, '-') || 'video';
        const outputPath = path.join(outDir, `${safeName}-${index}.mp4`);
        const started = Date.now();
        const inputProps = {...job.config, template: job.template, audio: job.audio};
        const result = await renderJob({serveUrl, inputProps, outputPath, browserExecutable, retries});
        const ms = Date.now() - started;

        if (!result.ok) {
          const rec = {...base, status: 'failed', error: result.error, ms};
          onProgress(rec);
          return rec;
        }
        const post = runPostQc(outputPath);
        if (post.errors.length) {
          const rec = {...base, status: 'failed', error: post.errors.join('；'), ms};
          onProgress(rec);
          return rec;
        }
        const {size} = await stat(outputPath);
        const rec = {...base, status: 'rendered', output: path.relative(root, outputPath), bytes: size, ms};
        onProgress(rec);
        return rec;
      } catch (error) {
        const rec = {...base, status: 'failed', error: error?.message || String(error)};
        onProgress(rec);
        return rec;
      }
    },
    concurrency,
  );

  return records;
};
