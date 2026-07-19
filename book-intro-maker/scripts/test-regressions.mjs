// 最小回归测试：覆盖第二轮反查确认的三类合并前硬伤。
//   1. 批量 id 路径遍历 + 同名覆盖（单元 + 集成）
//   2. books 非对象崩服务（集成，需渲染）
//   3. 大请求体稳定返回 413、连接不脏（集成）
//
// 用法：node scripts/test-regressions.mjs
//   - 413 与 id 清理单元测试无需浏览器，始终运行。
//   - books/批量渲染集成测试需要 BROWSER_EXECUTABLE（或本机 Chrome），未设则跳过并提示。

import {spawn} from 'node:child_process';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {runBatch} from './batch/lib/run-batch.mjs';
import {rowToConfig} from './batch/lib/row-to-config.mjs';

const PORT = 4999;
const B = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
};

// —— 单元：id 清理（无需服务）——
console.log('单元：批量 id 清理');
ok(rowToConfig({id: '..\\escape'}, 0).id === 'escape', "'..\\\\escape' -> 'escape'");
ok(!/[/\\.]/.test(rowToConfig({id: '../../etc/passwd'}, 0).id), '路径字符（. / \\）被清除');
ok(rowToConfig({id: '正常ID_1'}, 0).id === '正常ID_1', '合法 id（中文/下划线）保留');

// —— 单元：队列控制等待点 + 单条重试行号（无需浏览器）——
console.log('单元：批量队列控制');
const queueTestOut = path.join(process.cwd(), 'out', 'test-queue-control');
await rm(queueTestOut, {recursive: true, force: true});
let releaseQueueItem;
let beforeItemBase = null;
const beforeItemReached = new Promise((resolve) => {
  releaseQueueItem = () => resolve();
});
const waitGate = new Promise((resolve) => {
  const run = runBatch({
    rows: [{id: 'retry-me', books: {flashBooks: [], mainBook: {title: ''}}, subtitles: {tracks: []}, intro: {mode: 'generated'}}],
    root: process.cwd(),
    outDir: queueTestOut,
    indexOffset: 4,
    beforeItem: async (base) => {
      beforeItemBase = base;
      resolve();
      await beforeItemReached;
    },
  });
  globalThis.__queueControlRun = run;
});
await Promise.race([waitGate, sleep(15000)]);
ok(beforeItemBase?.index === 4, '等待点保留原始行号（单条重试写回原位置）');
releaseQueueItem();
const queueRecords = await globalThis.__queueControlRun;
ok(queueRecords[0]?.index === 4 && queueRecords[0]?.status === 'qc-failed', '等待释放后按原行号返回质检失败记录');
await rm(queueTestOut, {recursive: true, force: true});

const waitHealth = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${B}/api/health`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  return false;
};

const waitBatchDone = async (jobId) => {
  for (let i = 0; i < 40; i++) {
    const d = await (await fetch(`${B}/api/batch/${jobId}`)).json();
    if (!d.running) return d;
    await sleep(500);
  }
  return null;
};

const srv = spawn('node', [path.join('scripts', 'server.mjs')], {env: {...process.env, PORT: String(PORT)}, stdio: 'ignore'});

try {
  if (!(await waitHealth())) {
    console.log('服务未能启动');
    process.exitCode = 1;
  } else {
    // —— 集成：413（无需渲染）——
    console.log('集成：大请求体 -> 413');
    let status413 = 0;
    try {
      const r = await fetch(`${B}/api/render`, {method: 'POST', headers: {'content-type': 'application/json'}, body: 'a'.repeat(5 * 1024 * 1024)});
      status413 = r.status;
      await r.text();
    } catch {
      status413 = -1; // 连接被拒也算限制生效（未 OOM）
    }
    ok(status413 === 413, `5MB -> 413（实得 ${status413}）`);
    ok((await fetch(`${B}/api/health`)).ok, '413 后服务存活');
    ok((await fetch(`${B}/api/health`)).ok, '413 后可再次请求（连接未脏）');

    // —— 集成：批量队列失败原因 + 单条重试入口（无需渲染）——
    console.log('集成：批量队列控制');
    const badBatch = await (
      await fetch(`${B}/api/batch`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          videos: [{id: 'bad-qc', books: {flashBooks: [], mainBook: {title: ''}}, subtitles: {tracks: []}, intro: {mode: 'generated'}}],
        }),
      })
    ).json();
    const badDone = badBatch.jobId ? await waitBatchDone(badBatch.jobId) : null;
    ok(badDone?.records?.[0]?.status === 'qc-failed', '质检失败条目进入 qc-failed');
    ok((badDone?.records?.[0]?.qc?.errors || []).some((msg) => msg.includes('主书标题为空')), '失败原因返回到队列记录');
    const retryRes = await fetch(`${B}/api/batch/${badBatch.jobId}/retry`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({index: 0})});
    const retryStarted = await retryRes.json().catch(() => ({}));
    ok(retryRes.status === 202 && retryStarted.running === true, '单条重试返回 202 并重新进入队列');
    const retryDone = await waitBatchDone(badBatch.jobId);
    ok(retryDone?.records?.[0]?.status === 'qc-failed', '单条重试后仍写回原记录位置');

    // 渲染集成测试：本地设 BROWSER_EXECUTABLE，或 CI 设 RUN_RENDER_TESTS=1
    // （配合 `remotion browser ensure` 安装的无头浏览器）即可开启，绝不静默跳过渲染回归。
    if (process.env.BROWSER_EXECUTABLE || process.env.RUN_RENDER_TESTS === '1') {
      // —— 集成：books 非对象降级（需渲染）——
      console.log('集成：books 非对象 -> 降级出片，服务不崩');
      const rb = await fetch(`${B}/api/render`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({books: 'bad'})});
      const jb = await rb.json().catch(() => ({}));
      ok(rb.status === 200 && jb.ok === true, "{'books':'bad'} -> 200 降级出片");
      ok((await fetch(`${B}/api/health`)).ok, 'books=bad 后服务存活');

      // —— 集成：批量 id 越界 / 同名覆盖（需渲染）——
      console.log('集成：批量异常 id -> 不越界、不覆盖');
      const started = await (
        await fetch(`${B}/api/batch`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            videos: [
              {id: '..\\escape', mainTitle: '越界', flashBooks: 'x~1 | y~2'},
              {id: 'dup', mainTitle: '甲', flashBooks: 'x~1 | y~2'},
              {id: 'dup', mainTitle: '乙', flashBooks: 'x~1 | y~2'},
            ],
          }),
        })
      ).json();
      let records = [];
      for (let i = 0; i < 70; i++) {
        const d = await (await fetch(`${B}/api/batch/${started.jobId}`)).json();
        if (!d.running) {
          records = d.records || [];
          break;
        }
        await sleep(2000);
      }
      const urls = records.map((r) => (r && r.url) || '');
      const prefix = `/out/editor/${started.jobId}/`;
      ok(urls.length === 3 && urls.every((u) => u.startsWith(prefix)), '全部产物在 job 目录内（未越界）');
      ok(urls.some((u) => u.endsWith('escape-0.mp4')), "越界 id '..\\\\escape' -> escape-0.mp4");
      ok(urls.filter((u) => /dup-\d+\.mp4$/.test(u)).length === 2, '同名 id 不覆盖（dup-1 / dup-2）');
    } else {
      console.log('（未设 BROWSER_EXECUTABLE / RUN_RENDER_TESTS，跳过需渲染的 books / 批量 id 集成测试）');
    }
  }
} finally {
  srv.kill();
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
