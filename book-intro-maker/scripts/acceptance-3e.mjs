// 阶段 3E 合并前验收入口。
//
// 默认执行不依赖 GitHub Billing / 浏览器的本地链路：
//   1. 真实封面查询与降级统计
//   2. 自动卡点切点生成
//   3. 批量 dry-run 与质检归档
//
// 如需额外渲染 1 条 MP4，可设置 RUN_ACCEPTANCE_RENDER=1。

import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';

const root = process.cwd();
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const runId = stamp();
const acceptanceDir = path.join(root, 'out', 'acceptance', '3e', runId);
const shouldRender = process.env.RUN_ACCEPTANCE_RENDER === '1' || process.argv.includes('--render');

const runNode = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, {cwd: root, env: process.env});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolve({code, stdout, stderr}));
  });

const runStep = async (id, label, args, {required = true} = {}) => {
  console.log(`\n=== ${label} ===`);
  const startedAt = Date.now();
  const result = await runNode(args);
  const elapsedMs = Date.now() - startedAt;
  const logPath = path.join(acceptanceDir, `${id}.log`);
  await writeFile(
    logPath,
    [
      `$ node ${args.join(' ')}`,
      '',
      '# stdout',
      result.stdout.trimEnd(),
      '',
      '# stderr',
      result.stderr.trimEnd(),
      '',
      `exitCode=${result.code}`,
      `elapsedMs=${elapsedMs}`,
    ].join('\n'),
    'utf8',
  );
  return {
    id,
    label,
    command: `node ${args.join(' ')}`,
    exitCode: result.code,
    elapsedMs,
    required,
    log: path.relative(root, logPath),
  };
};

const readJsonIfExists = async (filePath) => {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, 'utf8'));
};

const latestManifestUnder = async (dir) => {
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir, {withFileTypes: true});
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(dir, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const info = await stat(manifestPath);
    candidates.push({manifestPath, mtimeMs: info.mtimeMs});
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.manifestPath || null;
};

const coverStats = (resolved) => {
  const books = [...(resolved?.flashBooks || []), ...(resolved?.mainBook ? [resolved.mainBook] : [])];
  const counts = {};
  for (const book of books) {
    const key = book.coverSource || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return {total: books.length, counts};
};

const main = async () => {
  await mkdir(acceptanceDir, {recursive: true});

  const steps = [];
  const blockers = [];

  steps.push(await runStep('01-covers', '真实封面查询与降级统计', ['scripts/fetch-covers.mjs']));

  const cutsPath = path.join(acceptanceDir, 'cuts.json');
  steps.push(
    await runStep('02-beats', '自动卡点切点生成', [
      'scripts/detect-beats.mjs',
      '--audio',
      'public/sample-beat.wav',
      '--start',
      '4',
      '--end',
      '7',
      '--max',
      '14',
      '--out',
      path.relative(root, cutsPath),
      '--print',
    ]),
  );

  const batchOut = path.join(acceptanceDir, 'batch-dry-run');
  steps.push(
    await runStep('03-batch-dry-run', '批量 dry-run 与质检归档', [
      'scripts/batch/render-batch.mjs',
      '--input',
      'config/batch/sample.json',
      '--dry',
      '--out',
      path.relative(root, batchOut),
    ]),
  );

  let renderManifest = null;
  if (shouldRender) {
    const renderOut = path.join(acceptanceDir, 'render-one');
    steps.push(
      await runStep('04-render-one', '可选真实 MP4 渲染', [
        'scripts/batch/render-batch.mjs',
        '--input',
        'config/batch/sample.json',
        '--limit',
        '1',
        '--concurrency',
        '1',
        '--retries',
        '0',
        '--out',
        path.relative(root, renderOut),
      ]),
    );
    const renderManifestPath = await latestManifestUnder(renderOut);
    renderManifest = renderManifestPath ? await readJsonIfExists(renderManifestPath) : null;
  } else {
    blockers.push('未执行真实 MP4 渲染；如需合并前完整人工验收，请设置 RUN_ACCEPTANCE_RENDER=1 后重跑。');
  }

  const resolvedBooks = await readJsonIfExists(path.join(root, 'config', 'books.resolved.json'));
  const cuts = await readJsonIfExists(cutsPath);
  const dryRunManifestPath = await latestManifestUnder(batchOut);
  const dryRunManifest = dryRunManifestPath ? await readJsonIfExists(dryRunManifestPath) : null;
  const covers = coverStats(resolvedBooks);

  if ((covers.counts.placeholder || 0) > 0) {
    blockers.push(`真实封面未全部闭环：${covers.counts.placeholder}/${covers.total} 本降级为 placeholder。`);
  }

  const hardFailures = steps.filter((step) => step.required && step.exitCode !== 0);
  const report = {
    stage: '3E',
    runId,
    createdAt: new Date().toISOString(),
    status: hardFailures.length > 0 ? 'failed' : blockers.length > 0 ? 'passed-with-followups' : 'passed',
    steps,
    summary: {
      covers,
      cuts: {
        count: cuts?.flashCutFrames?.length || 0,
        flashCutFrames: cuts?.flashCutFrames || [],
      },
      batchDryRun: dryRunManifest
        ? {
            total: dryRunManifest.total,
            summary: dryRunManifest.summary,
            manifest: path.relative(root, dryRunManifestPath),
          }
        : null,
      renderOne: renderManifest
        ? {
            total: renderManifest.total,
            summary: renderManifest.summary,
          }
        : shouldRender
          ? null
          : 'skipped',
    },
    blockers,
  };

  const reportJson = path.join(acceptanceDir, 'acceptance-report.json');
  const reportMd = path.join(acceptanceDir, 'acceptance-report.md');
  await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    reportMd,
    [
      '# 阶段 3E 验收报告',
      '',
      `- 运行 ID：${runId}`,
      `- 状态：${report.status}`,
      `- 封面统计：${JSON.stringify(covers.counts)}`,
      `- 自动卡点数量：${report.summary.cuts.count}`,
      `- 批量 dry-run：${JSON.stringify(report.summary.batchDryRun?.summary || null)}`,
      `- 真实渲染：${shouldRender ? JSON.stringify(report.summary.renderOne?.summary || null) : 'skipped'}`,
      '',
      '## 后续事项',
      '',
      ...(blockers.length ? blockers.map((item) => `- ${item}`) : ['- 无。']),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log('\n=== 阶段 3E 验收完成 ===');
  console.log(`状态：${report.status}`);
  console.log(`报告：${path.relative(root, reportJson)}`);
  console.log(`摘要：${path.relative(root, reportMd)}`);

  if (hardFailures.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
