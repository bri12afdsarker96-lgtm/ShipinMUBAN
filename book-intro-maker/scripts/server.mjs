// 本地编辑器服务（阶段三）。
//
// 把纯前端编辑器升级为本地 app：
//   - 托管编辑器（gui/dist）、静态素材（public）、渲染产物（out）。
//   - POST /api/render  渲染当前配置为 MP4，返回可播放链接（复用 render-core）。
//   - GET  /api/renders 列出已渲染产物。
//   - GET  /api/assets  返回素材库清单。
//   - GET  /api/health  探活。
//
// 用法：npm run gui:build && node scripts/server.mjs   然后打开 http://127.0.0.1:4000

import {createServer} from 'node:http';
import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {existsSync, createReadStream} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {getBundle, renderJob} from './batch/lib/render-core.mjs';
import {runBatch} from './batch/lib/run-batch.mjs';
import {loadAssets} from './lib/assets.mjs';

const root = process.cwd();
const assets = loadAssets(path.join(process.cwd(), 'config', 'assets.example.json'));
// 内存批量队列：jobId -> {jobId, total, records[], running, error}
const batchJobs = new Map();
const PORT = Number(process.env.PORT) || 4000;
const browserExecutable = process.env.BROWSER_EXECUTABLE || undefined;

const distDir = path.join(root, 'gui', 'dist');
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'out');
const editorOutDir = path.join(outDir, 'editor');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
};

const sendJson = (res, code, obj) => {
  cors(res);
  res.writeHead(code, {'content-type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(obj));
};

const MAX_BODY = 4 * 1024 * 1024; // 4MB 上限，防止无界 body 撑爆内存
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        // 暂停接收但不销毁 socket，让上层能正常回 413（destroy 会让客户端只收到连接失败）。
        req.pause();
        reject(Object.assign(new Error('请求体过大'), {statusCode: 413}));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });

// 读取并解析 JSON body，畸形输入抛 400（避免把内部错误经 500 泄露）。
const readJson = async (req) => {
  const body = await readBody(req);
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), {statusCode: 400});
  }
};

const uniqueSuffix = () => Math.random().toString(36).slice(2, 7);

const safeSlug = (value) =>
  String(value || '')
    .replace(/[^a-zA-Z0-9一-龥_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'editor';

// —— 静态文件：在 dist / public / out 目录查找，并校验不越出目录边界（防路径遍历）——
const withinBase = (base, target) => {
  const resolved = path.resolve(target);
  return resolved === base || resolved.startsWith(base + path.sep) ? resolved : null;
};

const resolveStatic = (urlPath) => {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (clean === '') return path.join(distDir, 'index.html');
  const candidates = clean.startsWith('out/')
    ? [[outDir, path.join(root, clean)]]
    : [
        [distDir, path.join(distDir, clean)],
        [publicDir, path.join(publicDir, clean)],
      ];
  for (const [base, target] of candidates) {
    const safe = withinBase(base, target);
    if (safe && existsSync(safe)) return safe;
  }
  return null;
};

const serveStatic = async (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    cors(res);
    res.writeHead(200, {'content-type': MIME[ext] || 'application/octet-stream', 'content-length': info.size});
    createReadStream(filePath).pipe(res);
  } catch {
    cors(res);
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('Not Found');
  }
};

// —— API ——
const handleRender = async (req, res) => {
  const raw = await readJson(req);
  const id = safeSlug(raw.id || raw.mainTitle || 'editor');
  const fileName = `${id}-${Date.now()}-${uniqueSuffix()}.mp4`;
  await mkdir(editorOutDir, {recursive: true});
  const outputPath = path.join(editorOutDir, fileName);

  const inputProps = {
    template: raw.template,
    audio: raw.audio,
    books: raw.books,
    subtitles: raw.subtitles,
    intro: raw.intro,
  };

  console.log(`[render] ${id} …`);
  const started = Date.now();
  const serveUrl = await getBundle(root);
  const result = await renderJob({serveUrl, inputProps, outputPath, browserExecutable, retries: 1});
  const ms = Date.now() - started;

  if (!result.ok) {
    console.error(`[render] ${id} 失败：${result.error}`);
    return sendJson(res, 500, {ok: false, error: result.error});
  }
  const {size} = await stat(outputPath);
  console.log(`[render] ${id} 完成 (${(size / 1e6).toFixed(2)}MB, ${(ms / 1000).toFixed(1)}s)`);
  return sendJson(res, 200, {ok: true, url: `/out/editor/${fileName}`, bytes: size, ms});
};

const handleRenders = async (res) => {
  if (!existsSync(editorOutDir)) return sendJson(res, 200, {renders: []});
  const files = (await readdir(editorOutDir)).filter((f) => f.endsWith('.mp4'));
  const renders = [];
  for (const f of files) {
    const info = await stat(path.join(editorOutDir, f));
    renders.push({url: `/out/editor/${f}`, bytes: info.size, mtime: info.mtimeMs});
  }
  renders.sort((a, b) => b.mtime - a.mtime);
  return sendJson(res, 200, {renders});
};

const relUrl = (output) => (output ? `/${output.split(path.sep).join('/')}` : undefined);

const MAX_BATCH_JOBS = 50; // 内存队列容量上限，超出淘汰最旧任务

const handleBatchStart = async (req, res) => {
  const body = await readJson(req);
  const videos = Array.isArray(body.videos) ? body.videos : Array.isArray(body) ? body : [];
  if (videos.length === 0) return sendJson(res, 400, {ok: false, error: '缺少 videos 数组'});

  const jobId = `batch-${Date.now()}-${uniqueSuffix()}`;
  const outDir = path.join(editorOutDir, jobId);
  const state = {jobId, total: videos.length, records: new Array(videos.length).fill(null), running: true, createdAt: new Date().toISOString()};
  if (batchJobs.size >= MAX_BATCH_JOBS) {
    batchJobs.delete(batchJobs.keys().next().value); // Map 保插入序，删最旧
  }
  batchJobs.set(jobId, state);

  console.log(`[batch] ${jobId} 启动，共 ${videos.length} 条`);
  runBatch({
    rows: videos,
    root,
    assets,
    browserExecutable,
    concurrency: Number(body.concurrency) || 1,
    retries: 1,
    outDir,
    onProgress: (p) => {
      state.records[p.index] = {...p, url: relUrl(p.output)};
    },
  })
    .then(async (records) => {
      state.running = false;
      const summary = records.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      state.summary = summary;
      try {
        await mkdir(outDir, {recursive: true});
        await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({jobId, total: videos.length, createdAt: state.createdAt, summary, records}, null, 2)}\n`, 'utf8');
      } catch (error) {
        console.warn(`[batch] ${jobId} 归档失败：${error.message}`);
      }
      console.log(`[batch] ${jobId} 完成 ${JSON.stringify(summary)}`);
    })
    .catch((error) => {
      state.running = false;
      state.error = error.message;
      console.error(`[batch] ${jobId} 出错：${error.message}`);
    });

  return sendJson(res, 200, {ok: true, jobId, total: videos.length});
};

const handleBatchStatus = (res, jobId) => {
  const state = batchJobs.get(jobId);
  if (!state) return sendJson(res, 404, {ok: false, error: '未找到该批量任务'});
  return sendJson(res, 200, state);
};

// 批量历史：优先内存态，补充磁盘归档（服务重启后仍可见）。
const handleBatchesList = async (res) => {
  const seen = new Map();
  for (const [jobId, s] of batchJobs) {
    seen.set(jobId, {jobId, total: s.total, running: s.running, summary: s.summary, createdAt: s.createdAt});
  }
  if (existsSync(editorOutDir)) {
    const dirs = (await readdir(editorOutDir, {withFileTypes: true})).filter((d) => d.isDirectory() && d.name.startsWith('batch-'));
    for (const d of dirs) {
      if (seen.has(d.name)) continue;
      const mf = path.join(editorOutDir, d.name, 'manifest.json');
      if (existsSync(mf)) {
        try {
          const m = JSON.parse(await readFile(mf, 'utf8'));
          seen.set(d.name, {jobId: m.jobId, total: m.total, running: false, summary: m.summary, createdAt: m.createdAt});
        } catch {
          /* 跳过损坏的归档 */
        }
      }
    }
  }
  const batches = [...seen.values()].sort((a, b) => String(b.jobId).localeCompare(String(a.jobId)));
  return sendJson(res, 200, {batches});
};

const handleAssets = async (res) => {
  const p = path.join(root, 'config', 'assets.example.json');
  if (!existsSync(p)) return sendJson(res, 200, {});
  return sendJson(res, 200, JSON.parse(await readFile(p, 'utf8')));
};

const server = createServer(async (req, res) => {
  try {
    // 防 DNS-rebinding：只接受本机 Host，挡住外部域名指向 127.0.0.1 的浏览器请求。
    const host = (req.headers.host || '').split(':')[0];
    if (host && host !== '127.0.0.1' && host !== 'localhost') {
      res.writeHead(403, {'content-type': 'text/plain; charset=utf-8'});
      return res.end('Forbidden host');
    }
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      return res.end();
    }
    const url = req.url || '/';
    // 注意：async handler 必须 await，否则内部抛错会变成 unhandled rejection 崩溃进程。
    if (url === '/api/health') return sendJson(res, 200, {ok: true});
    if (url === '/api/assets') return await handleAssets(res);
    if (url.startsWith('/api/renders')) return await handleRenders(res);
    if (url === '/api/render' && req.method === 'POST') return await handleRender(req, res);
    if (url === '/api/batches') return await handleBatchesList(res);
    if (url === '/api/batch' && req.method === 'POST') return await handleBatchStart(req, res);
    if (url.startsWith('/api/batch/')) return handleBatchStatus(res, url.slice('/api/batch/'.length).split('?')[0]);

    const filePath = resolveStatic(url);
    if (!filePath) {
      cors(res);
      res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
      return res.end('Not Found');
    }
    return await serveStatic(res, filePath);
  } catch (error) {
    console.error(error);
    const code = error?.statusCode || 500;
    // 客户端错误（400/413）回显受控文案；服务器错误不泄露内部 message。
    return sendJson(res, code, {ok: false, error: code >= 500 ? '服务器内部错误' : error.message});
  }
});

server.listen(PORT, '127.0.0.1', () => {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    console.warn('提示：未找到 gui/dist，请先运行 npm run gui:build');
  }
  console.log(`编辑器服务：http://127.0.0.1:${PORT}`);
});
