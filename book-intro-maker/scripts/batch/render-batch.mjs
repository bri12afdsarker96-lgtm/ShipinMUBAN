// 批量生产引擎 CLI（阶段三）。
//
// 流程：导入数据 -> 行映射为三件套 -> 素材解析 -> 自动卡点 -> 质检 -> 队列渲染
// （并发上限 + 失败重试）-> 渲染后质检 -> 归档 manifest / 质检报告。
// 核心编排在 lib/run-batch.mjs（与本地服务队列共用）。
//
// 用法：
//   node scripts/batch/render-batch.mjs --input config/batch/sample.json
//   node scripts/batch/render-batch.mjs --input data.csv --concurrency 2 --retries 2
//   node scripts/batch/render-batch.mjs --input data.json --dry      # 只质检不渲染
//
// 参数：--input <file>（必填 .json/.csv）、--out <dir>、--concurrency <n>、
//       --retries <n>、--limit <n>、--browser <path>、--assets <file>、--dry

import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {parseInputFile} from './lib/parse-input.mjs';
import {loadAssets} from '../lib/assets.mjs';
import {runQc} from './lib/qc.mjs';
import {prepareJobs, runBatch} from './lib/run-batch.mjs';

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
    else if (a === '--assets') args.assets = argv[++i];
  }
  return args;
};

const timestampId = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

const archive = async ({jobDir, jobId, inputPath, root, dry, records}) => {
  const summary = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const manifest = {jobId, input: path.relative(root, inputPath), createdAt: new Date().toISOString(), dry, total: records.length, summary, records};
  await writeFile(path.join(jobDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const qcReport = records.map((r) => ({id: r.id, status: r.status, ...r.qc}));
  await writeFile(path.join(jobDir, 'qc-report.json'), `${JSON.stringify(qcReport, null, 2)}\n`, 'utf8');
  return summary;
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
  let rows = await parseInputFile(inputPath);
  if (args.limit) rows = rows.slice(0, args.limit);
  console.log(`导入 ${rows.length} 条视频任务`);

  const assetsPath = path.resolve(root, args.assets || 'config/assets.example.json');
  const assets = loadAssets(assetsPath);
  if (assets) console.log(`素材库：${path.relative(root, assetsPath)}`);

  const jobId = timestampId();
  const jobDir = path.join(root, args.out, jobId);
  const videosDir = path.join(jobDir, 'videos');
  await mkdir(videosDir, {recursive: true});

  let records;
  if (args.dry) {
    const jobs = prepareJobs(rows, {root, assets});
    records = jobs.map((job) => {
      const qc = runQc(job, root);
      return {id: job.id, template: job.template, status: qc.errors.length ? 'qc-failed' : 'qc-passed', qc: {errors: qc.errors, warnings: qc.warnings, infos: qc.infos}};
    });
  } else {
    console.log('打包 Remotion 项目…');
    records = await runBatch({
      rows,
      root,
      assets,
      browserExecutable,
      concurrency: args.concurrency,
      retries: args.retries,
      outDir: videosDir,
      onProgress: (p) => {
        if (p.status === 'rendering') console.log(`[渲染] ${p.id} …`);
        else if (p.status === 'rendered') console.log(`[完成] ${p.id} (${(p.bytes / 1048576).toFixed(2)}MB, ${(p.ms / 1000).toFixed(1)}s)`);
        else if (p.status === 'failed') console.error(`[失败] ${p.id}：${p.error}`);
        else if (p.status === 'qc-failed') console.warn(`[跳过] ${p.id}：质检未通过`);
      },
    });
  }

  const summary = await archive({jobDir, jobId, inputPath, root, dry: args.dry, records});

  console.log(`\n=== 批量完成：${jobId} ===`);
  console.log(`输出目录：${path.relative(root, jobDir)}`);
  console.log(`统计：${JSON.stringify(summary)}`);
  const warned = records.filter((r) => r.qc.warnings.length > 0);
  if (warned.length > 0) console.log(`质检警告：${warned.length} 条（详见 qc-report.json）`);
  if (summary.failed) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
