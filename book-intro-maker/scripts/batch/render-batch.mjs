// 批量生产引擎（阶段三）。
//
// 流程：导入数据 -> 行映射为三件套配置 -> 渲染前质检 -> 一次打包、队列渲染
// （并发上限 + 失败重试）-> 渲染后质检 -> 归档输出并写 manifest / 质检报告。
//
// 用法：
//   node scripts/batch/render-batch.mjs --input config/batch/sample.json
//   node scripts/batch/render-batch.mjs --input data.csv --concurrency 2 --retries 2
//   node scripts/batch/render-batch.mjs --input data.json --dry      # 只质检不渲染
//
// 参数：
//   --input <file>       必填，.json 或 .csv
//   --out <dir>          输出根目录（默认 out/batch）
//   --concurrency <n>    批量并发条数（默认 1）
//   --retries <n>        单条失败重试次数（默认 2）
//   --limit <n>          只处理前 n 条
//   --browser <path>     浏览器可执行文件（默认取环境变量 BROWSER_EXECUTABLE）
//   --dry                只导入 + 质检，不渲染

import {existsSync} from 'node:fs';
import {mkdir, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {parseInputFile} from './lib/parse-input.mjs';
import {rowToConfig} from './lib/row-to-config.mjs';
import {runPool} from './lib/pool.mjs';
import {runQc, runPostQc} from './lib/qc.mjs';

const COMPOSITION_ID = 'BookIntroFromConfig';

const parseArgs = (argv) => {
  const args = {out: 'out/batch', concurrency: 1, retries: 2, dry: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') args.dry = true;
    else if (a === '--input') args.input = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]) || 1;
    else if (a === '--retries') args.retries = Number(argv[++i]) || 0;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--browser') args.browser = argv[++i];
  }
  return args;
};

const timestampId = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

const renderOne = async ({serveUrl, job, outputPath, browserExecutable, retries}) => {
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const composition = await selectComposition({
        serveUrl,
        id: COMPOSITION_ID,
        inputProps: job.config,
        browserExecutable,
      });
      await renderMedia({
        serveUrl,
        composition,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: job.config,
        browserExecutable,
      });
      return {ok: true, attempts: attempt};
    } catch (error) {
      lastError = error;
      if (attempt <= retries) {
        console.warn(`  [${job.id}] 第 ${attempt} 次渲染失败，重试：${error.message}`);
      }
    }
  }
  return {ok: false, attempts: retries + 1, error: lastError?.message || String(lastError)};
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  if (!args.input) {
    console.error('缺少 --input <file>');
    process.exitCode = 1;
    return;
  }
  const inputPath = path.resolve(root, args.input);
  if (!existsSync(inputPath)) {
    console.error(`输入文件不存在：${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const browserExecutable = args.browser || process.env.BROWSER_EXECUTABLE || undefined;

  // 1. 导入 + 映射。
  const rows = await parseInputFile(inputPath);
  let jobs = rows.map((row, i) => rowToConfig(row, i));
  if (args.limit) jobs = jobs.slice(0, args.limit);
  console.log(`导入 ${jobs.length} 条视频任务`);

  // 全局质检：音频存在。
  const audioOk = existsSync(path.join(root, 'public', 'sample-beat.wav'));
  if (!audioOk) console.warn('[qc] 警告：public/sample-beat.wav 缺失，视频将没有节拍音频');

  const jobId = timestampId();
  const jobDir = path.join(root, args.out, jobId);
  const videosDir = path.join(jobDir, 'videos');
  await mkdir(videosDir, {recursive: true});

  // 2. 渲染前质检。
  const prepared = jobs.map((job) => ({job, qc: runQc(job, root)}));

  // 3. 打包（渲染时才需要）。
  let serveUrl = null;
  if (!args.dry) {
    console.log('打包 Remotion 项目…');
    serveUrl = await bundle({
      entryPoint: path.join(root, 'src', 'index.ts'),
      publicDir: path.join(root, 'public'),
    });
  }

  // 4. 队列渲染 + 渲染后质检。
  const records = await runPool(
    prepared,
    async ({job, qc}) => {
      const started = Date.now();
      const base = {
        id: job.id,
        template: job.template,
        qc: {errors: qc.errors, warnings: qc.warnings, infos: qc.infos},
      };

      if (qc.errors.length > 0) {
        console.warn(`[跳过] ${job.id}：质检未通过 -> ${qc.errors.join('；')}`);
        return {...base, status: 'qc-failed'};
      }
      if (args.dry) {
        return {...base, status: 'qc-passed'};
      }

      const outputPath = path.join(videosDir, `${job.id}.mp4`);
      console.log(`[渲染] ${job.id} …`);
      const result = await renderOne({serveUrl, job, outputPath, browserExecutable, retries: args.retries});
      const ms = Date.now() - started;

      if (!result.ok) {
        console.error(`[失败] ${job.id}：${result.error}`);
        return {...base, status: 'failed', attempts: result.attempts, error: result.error, ms};
      }

      const post = runPostQc(outputPath);
      if (post.errors.length > 0) {
        return {...base, status: 'failed', attempts: result.attempts, error: post.errors.join('；'), ms};
      }
      const {size} = await stat(outputPath);
      console.log(`[完成] ${job.id} (${(size / 1024 / 1024).toFixed(2)}MB, ${(ms / 1000).toFixed(1)}s)`);
      return {
        ...base,
        status: 'rendered',
        attempts: result.attempts,
        output: path.relative(root, outputPath),
        bytes: size,
        ms,
      };
    },
    args.concurrency,
  );

  // 5. 归档 manifest + 质检报告。
  const summary = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const manifest = {
    jobId,
    input: path.relative(root, inputPath),
    createdAt: new Date().toISOString(),
    dry: args.dry,
    total: records.length,
    summary,
    records,
  };
  await writeFile(path.join(jobDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const qcReport = records.map((r) => ({id: r.id, status: r.status, ...r.qc}));
  await writeFile(path.join(jobDir, 'qc-report.json'), `${JSON.stringify(qcReport, null, 2)}\n`, 'utf8');

  // 控制台汇总。
  console.log(`\n=== 批量完成：${jobId} ===`);
  console.log(`输出目录：${path.relative(root, jobDir)}`);
  console.log(`统计：${JSON.stringify(summary)}`);
  const warned = records.filter((r) => r.qc.warnings.length > 0);
  if (warned.length > 0) {
    console.log(`质检警告：${warned.length} 条（详见 qc-report.json）`);
  }
  if (summary.failed) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
