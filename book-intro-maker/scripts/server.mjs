// 本地编辑器服务（阶段三）。
//
// 把纯前端编辑器升级为本地 app：
//   - 托管编辑器（gui/dist）、静态素材（public）、渲染产物（out）。
//   - POST /api/render  渲染当前配置为 MP4，返回可播放链接（复用 render-core）。
//   - GET  /api/renders 列出已渲染产物。
//   - GET  /api/assets  返回素材库清单。
//   - POST /api/batch/:id/pause|resume|retry  控制批量队列。
//   - GET  /api/health  探活。
//
// 用法：npm run gui:build && node scripts/server.mjs   然后打开 http://127.0.0.1:4000

import {createServer} from 'node:http';
import {readFile, readdir, stat, mkdir, writeFile, rename, unlink} from 'node:fs/promises';
import {existsSync, createReadStream, readFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {getBundle, renderJob} from './batch/lib/render-core.mjs';
import {runBatch} from './batch/lib/run-batch.mjs';
import {loadAssets} from './lib/assets.mjs';
import {decodeWav} from './lib/audio/wav.mjs';
import {detectOnsets, onsetsToFrames} from './lib/audio/onset.mjs';
import {resolveBookCover} from './lib/covers.mjs';

const root = process.cwd();
const assets = loadAssets(path.join(process.cwd(), 'config', 'assets.example.json'));
// 内存批量队列：jobId -> {jobId, total, records[], rows[], running, paused, error}
const batchJobs = new Map();
const PORT = Number(process.env.PORT) || 4000;
const browserExecutable = process.env.BROWSER_EXECUTABLE || undefined;

const distDir = path.join(root, 'gui', 'dist');
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'out');
const editorOutDir = path.join(outDir, 'editor');

// —— 可写设置：编辑器单片渲染输出子目录，严格锁定在 out/ 根内 ——
const configDir = path.join(root, 'config');
const settingsFile = path.join(configDir, 'editor-settings.json');
const DEFAULT_OUTPUT_SUBDIR = 'editor';
const MAX_SUBDIR_DEPTH = 4;
const SUBDIR_SEGMENT = /^[A-Za-z0-9一-龥_-]{1,40}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
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

const MAX_BODY = 4 * 1024 * 1024; // 默认 4MB 上限，防止普通 API 无界 body 撑爆内存
const MAX_UPLOAD_BODY = 90 * 1024 * 1024; // 本地素材上传需要容纳短视频 / 音频的 base64 JSON
const readBody = (req, {maxBytes = MAX_BODY} = {}) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > maxBytes) {
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

const readUploadJson = async (req) => {
  const body = await readBody(req, {maxBytes: MAX_UPLOAD_BODY});
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

// 把用户输入解析成受控子目录段：返回 {segments, rel, full}；非法输入抛 400。
// 空输入回落默认子目录。硬拒 .. / 反斜杠 / 绝对路径 / 盘符 / 波浪号 / 控制字符，
// 每段再逐一走安全字符白名单，最后用 withinBase(outDir) 兜底纵深防御。
const outputSubdirResult = (segments) => {
  const full = withinBase(outDir, path.join(outDir, ...segments));
  if (!full) throw Object.assign(new Error('输出子目录越界'), {statusCode: 400});
  return {segments, rel: segments.join('/'), full};
};

const parseOutputSubdir = (input) => {
  const raw = String(input ?? '').trim();
  if (raw === '') return outputSubdirResult([DEFAULT_OUTPUT_SUBDIR]);
  if (
    /[\\]/.test(raw) ||
    raw.includes('..') ||
    raw.startsWith('/') ||
    /^[A-Za-z]:/.test(raw) ||
    raw.startsWith('~') ||
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    throw Object.assign(new Error('输出子目录不能包含 .. 、绝对路径或盘符'), {statusCode: 400});
  }
  const segments = raw.split('/').filter((s) => s !== '');
  if (segments.length === 0 || segments.length > MAX_SUBDIR_DEPTH) {
    throw Object.assign(new Error(`输出子目录最多 ${MAX_SUBDIR_DEPTH} 层`), {statusCode: 400});
  }
  for (const seg of segments) {
    if (seg === '.' || seg === '..' || !SUBDIR_SEGMENT.test(seg)) {
      throw Object.assign(new Error('每层目录只能是字母/数字/中文/下划线/连字符（≤40 字符）'), {statusCode: 400});
    }
  }
  return outputSubdirResult(segments);
};

const readSettingsFile = () => {
  try {
    if (!existsSync(settingsFile)) return {};
    const parsed = JSON.parse(readFileSync(settingsFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {}; // 损坏的设置文件降级为默认，绝不因此崩服务
  }
};

// 读取「当前有效」输出子目录：即便 settings 文件被手改注入 .. / 绝对路径，
// 也在此重新过一遍边界校验，非法则回落默认——持久化值绝不被无条件信任。
const currentOutputSubdir = () => {
  try {
    return parseOutputSubdir(readSettingsFile().outputSubdir);
  } catch {
    return outputSubdirResult([DEFAULT_OUTPUT_SUBDIR]);
  }
};

const editorOutDirNow = () => currentOutputSubdir().full;
const editorOutUrlBase = () => `/out/${currentOutputSubdir().rel}`;

const resolveStatic = (urlPath) => {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (clean === '') return path.join(distDir, 'index.html');
  const candidates = clean.startsWith('out/')
    ? [[outDir, path.join(root, clean)]]
    : clean.startsWith('public/')
      ? [[publicDir, path.join(root, clean)]]
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
  const dir = editorOutDirNow();
  await mkdir(dir, {recursive: true});
  const outputPath = path.join(dir, fileName);

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
  return sendJson(res, 200, {ok: true, url: `${editorOutUrlBase()}/${fileName}`, bytes: size, ms});
};

const handleRenders = async (res) => {
  const dir = editorOutDirNow();
  const urlBase = editorOutUrlBase();
  if (!existsSync(dir)) return sendJson(res, 200, {renders: []});
  const files = (await readdir(dir)).filter((f) => f.endsWith('.mp4'));
  const renders = [];
  for (const f of files) {
    const info = await stat(path.join(dir, f));
    renders.push({url: `${urlBase}/${f}`, bytes: info.size, mtime: info.mtimeMs});
  }
  renders.sort((a, b) => b.mtime - a.mtime);
  return sendJson(res, 200, {renders});
};

const relUrl = (output) => (output ? `/${output.split(path.sep).join('/')}` : undefined);

const MAX_BATCH_JOBS = 50; // 内存队列容量上限，超出淘汰最旧任务
const RETRYABLE_STATUSES = new Set(['failed', 'qc-failed']);

const summarizeRecords = (records) =>
  records.filter(Boolean).reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

const publicBatchState = (state) => ({
  ok: true,
  jobId: state.jobId,
  total: state.total,
  records: state.records,
  running: state.running,
  paused: state.paused,
  status: state.status,
  createdAt: state.createdAt,
  summary: state.summary,
  error: state.error,
  waitingIndex: state.waitingIndex,
  retrying: [...state.retrying],
});

const archiveBatchState = async (state) => {
  const records = state.records.filter(Boolean);
  const summary = state.summary || summarizeRecords(records);
  await mkdir(state.outDir, {recursive: true});
  await writeFile(
    path.join(state.outDir, 'manifest.json'),
    `${JSON.stringify({jobId: state.jobId, total: state.total, createdAt: state.createdAt, status: state.status, summary, records}, null, 2)}\n`,
    'utf8',
  );
};

const releasePauseWaiters = (state) => {
  const waiters = state.pauseWaiters.splice(0);
  for (const resolve of waiters) resolve();
};

const waitIfPaused = async (state, base) => {
  if (!state.paused) return;
  state.status = 'paused';
  state.waitingIndex = base.index;
  state.records[base.index] = {...(state.records[base.index] || {}), ...base, status: 'paused'};
  await new Promise((resolve) => state.pauseWaiters.push(resolve));
  if (state.waitingIndex === base.index) state.waitingIndex = null;
};

const setBatchProgress = (state, progress) => {
  state.records[progress.index] = {...progress, url: relUrl(progress.output)};
};

const finishBatchRun = async (state, label) => {
  state.running = false;
  state.paused = false;
  state.status = 'completed';
  state.waitingIndex = null;
  state.summary = summarizeRecords(state.records);
  releasePauseWaiters(state);
  try {
    await archiveBatchState(state);
  } catch (error) {
    console.warn(`[batch] ${state.jobId} 归档失败：${error.message}`);
  }
  console.log(`[batch] ${state.jobId} ${label}完成 ${JSON.stringify(state.summary)}`);
};

const failBatchRun = async (state, error, label) => {
  state.running = false;
  state.paused = false;
  state.status = 'failed';
  state.waitingIndex = null;
  state.error = error.message;
  state.summary = summarizeRecords(state.records);
  releasePauseWaiters(state);
  try {
    await archiveBatchState(state);
  } catch (archiveError) {
    console.warn(`[batch] ${state.jobId} 归档失败：${archiveError.message}`);
  }
  console.error(`[batch] ${state.jobId} ${label}出错：${error.message}`);
};

const startBatchRun = (state, {rows, indexOffset = 0, retryIndex = null}) => {
  state.running = true;
  state.status = retryIndex == null ? 'running' : 'retrying';
  state.error = undefined;
  runBatch({
    rows,
    root,
    assets,
    browserExecutable,
    concurrency: state.concurrency,
    retries: state.retries,
    outDir: state.outDir,
    indexOffset,
    beforeItem: (base) => waitIfPaused(state, base),
    onProgress: (p) => setBatchProgress(state, p),
  })
    .then(async () => {
      if (retryIndex != null) state.retrying.delete(retryIndex);
      await finishBatchRun(state, retryIndex == null ? '' : `重试第 ${retryIndex + 1} 条`);
    })
    .catch(async (error) => {
      if (retryIndex != null) state.retrying.delete(retryIndex);
      await failBatchRun(state, error, retryIndex == null ? '' : `重试第 ${retryIndex + 1} 条`);
    });
};

const handleBatchStart = async (req, res) => {
  const body = await readJson(req);
  const videos = Array.isArray(body.videos) ? body.videos : Array.isArray(body) ? body : [];
  if (videos.length === 0) return sendJson(res, 400, {ok: false, error: '缺少 videos 数组'});

  const jobId = `batch-${Date.now()}-${uniqueSuffix()}`;
  const outDir = path.join(editorOutDir, jobId);
  const state = {
    jobId,
    total: videos.length,
    rows: videos,
    records: new Array(videos.length).fill(null),
    running: true,
    paused: false,
    status: 'running',
    createdAt: new Date().toISOString(),
    outDir,
    concurrency: Number(body.concurrency) || 1,
    retries: 1,
    waitingIndex: null,
    pauseWaiters: [],
    retrying: new Set(),
  };
  if (batchJobs.size >= MAX_BATCH_JOBS) {
    batchJobs.delete(batchJobs.keys().next().value); // Map 保插入序，删最旧
  }
  batchJobs.set(jobId, state);

  console.log(`[batch] ${jobId} 启动，共 ${videos.length} 条`);
  startBatchRun(state, {rows: videos});

  return sendJson(res, 200, publicBatchState(state));
};

const handleBatchStatus = (res, jobId) => {
  const state = batchJobs.get(jobId);
  if (!state) return sendJson(res, 404, {ok: false, error: '未找到该批量任务'});
  return sendJson(res, 200, publicBatchState(state));
};

const handleBatchPause = (res, jobId) => {
  const state = batchJobs.get(jobId);
  if (!state) return sendJson(res, 404, {ok: false, error: '未找到该批量任务'});
  if (!state.running) return sendJson(res, 409, {ok: false, error: '任务已结束，不能暂停'});
  state.paused = true;
  state.status = 'paused';
  return sendJson(res, 200, publicBatchState(state));
};

const handleBatchResume = (res, jobId) => {
  const state = batchJobs.get(jobId);
  if (!state) return sendJson(res, 404, {ok: false, error: '未找到该批量任务'});
  if (!state.running) return sendJson(res, 409, {ok: false, error: '任务已结束，不能恢复'});
  state.paused = false;
  state.status = state.retrying.size > 0 ? 'retrying' : 'running';
  releasePauseWaiters(state);
  return sendJson(res, 200, publicBatchState(state));
};

const handleBatchRetry = async (req, res, jobId) => {
  const state = batchJobs.get(jobId);
  if (!state) return sendJson(res, 404, {ok: false, error: '未找到该批量任务'});
  const body = await readJson(req);
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.total) {
    return sendJson(res, 400, {ok: false, error: '重试序号无效'});
  }
  if (state.running) {
    return sendJson(res, 409, {ok: false, error: '当前队列仍在运行，请结束后再重试单条'});
  }
  const current = state.records[index];
  if (!current) return sendJson(res, 404, {ok: false, error: '该条记录尚不存在'});
  if (!RETRYABLE_STATUSES.has(current.status)) {
    return sendJson(res, 409, {ok: false, error: '只有失败或质检未过的条目可以重试'});
  }
  state.retrying.add(index);
  state.records[index] = {
    ...current,
    status: 'queued',
    error: undefined,
    retriedAt: new Date().toISOString(),
    previousStatus: current.status,
    previousError: current.error,
  };
  startBatchRun(state, {rows: [state.rows[index]], indexOffset: index, retryIndex: index});
  return sendJson(res, 202, publicBatchState(state));
};

// 批量历史：优先内存态，补充磁盘归档（服务重启后仍可见）。
const handleBatchesList = async (res) => {
  const seen = new Map();
  for (const [jobId, s] of batchJobs) {
    seen.set(jobId, {jobId, total: s.total, running: s.running, paused: s.paused, status: s.status, summary: s.summary, createdAt: s.createdAt});
  }
  if (existsSync(editorOutDir)) {
    const dirs = (await readdir(editorOutDir, {withFileTypes: true})).filter((d) => d.isDirectory() && d.name.startsWith('batch-'));
    for (const d of dirs) {
      if (seen.has(d.name)) continue;
      const mf = path.join(editorOutDir, d.name, 'manifest.json');
      if (existsSync(mf)) {
        try {
          const m = JSON.parse(await readFile(mf, 'utf8'));
          seen.set(d.name, {jobId: m.jobId, total: m.total, running: false, paused: false, status: m.status || 'completed', summary: m.summary, createdAt: m.createdAt});
        } catch {
          /* 跳过损坏的归档 */
        }
      }
    }
  }
  const batches = [...seen.values()].sort((a, b) => String(b.jobId).localeCompare(String(a.jobId)));
  return sendJson(res, 200, {batches});
};

const ASSET_LIBRARY_KINDS = {
  covers: {
    label: '书籍封面',
    folders: [{dir: path.join(publicDir, 'covers'), prefix: 'covers'}],
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  },
  backgrounds: {
    label: '背景图',
    folders: [{dir: path.join(publicDir, 'backgrounds'), prefix: 'backgrounds'}],
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  },
  introVideos: {
    label: '开场视频',
    folders: [{dir: path.join(publicDir, 'intro-videos'), prefix: 'intro-videos'}],
    extensions: new Set(['.mp4', '.webm', '.mov']),
  },
  audio: {
    label: '背景音乐',
    folders: [
      {dir: path.join(publicDir, 'audio'), prefix: 'audio'},
      {dir: publicDir, prefix: ''},
    ],
    extensions: new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']),
  },
};

const listAssetFiles = async (kind, spec) => {
  const items = [];
  for (const folder of spec.folders) {
    if (!existsSync(folder.dir)) continue;
    const entries = await readdir(folder.dir, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!spec.extensions.has(ext)) continue;
      const filePath = path.join(folder.dir, entry.name);
      const info = await stat(filePath);
      const assetPath = folder.prefix ? `${folder.prefix}/${entry.name}` : entry.name;
      const mutable = Boolean(folder.prefix);
      items.push({
        kind,
        name: entry.name,
        path: assetPath,
        url: `/${assetPath}`,
        bytes: info.size,
        mtime: info.mtimeMs,
        mime: MIME[ext] || 'application/octet-stream',
        mutable,
      });
    }
  }
  items.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  return items;
};

const handleAssets = async (res) => {
  const library = {};
  const counts = {};
  for (const [kind, spec] of Object.entries(ASSET_LIBRARY_KINDS)) {
    const items = await listAssetFiles(kind, spec);
    library[kind] = items;
    counts[kind] = items.length;
  }
  return sendJson(res, 200, {ok: true, assets: library, counts});
};

const UPLOAD_KINDS = {
  covers: {
    dir: path.join(publicDir, 'covers'),
    prefix: 'covers',
    maxBytes: 3 * 1024 * 1024,
    mimeToExt: {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'},
  },
  backgrounds: {
    dir: path.join(publicDir, 'backgrounds'),
    prefix: 'backgrounds',
    maxBytes: 8 * 1024 * 1024,
    mimeToExt: {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'},
  },
  introVideos: {
    dir: path.join(publicDir, 'intro-videos'),
    prefix: 'intro-videos',
    maxBytes: 64 * 1024 * 1024,
    mimeToExt: {'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'},
  },
  audio: {
    dir: path.join(publicDir, 'audio'),
    prefix: 'audio',
    maxBytes: 24 * 1024 * 1024,
    mimeToExt: {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/mp4': '.m4a',
      'audio/aac': '.aac',
      'audio/ogg': '.ogg',
    },
  },
};

const mutableAssetExtensions = (kind) => ASSET_LIBRARY_KINDS[kind]?.extensions || new Set();

const resolveMutableAsset = (kind, rawPath) => {
  const spec = UPLOAD_KINDS[kind];
  if (!spec) throw Object.assign(new Error('不支持的素材类型'), {statusCode: 400});

  const value = String(rawPath || '').trim();
  if (!value || /^(https?:|data:|blob:)/i.test(value) || /[\\]/.test(value) || value.includes('..')) {
    throw Object.assign(new Error('素材路径无效'), {statusCode: 400});
  }

  const clean = value.replace(/^public\//, '').replace(/^\/+/, '');
  const baseName = path.posix.basename(clean);
  if (!baseName || clean !== `${spec.prefix}/${baseName}`) {
    throw Object.assign(new Error('只能操作对应素材分类目录内的文件'), {statusCode: 400});
  }

  const ext = path.extname(baseName).toLowerCase();
  if (!mutableAssetExtensions(kind).has(ext)) {
    throw Object.assign(new Error('素材文件格式不允许操作'), {statusCode: 400});
  }

  const fullPath = withinBase(spec.dir, path.join(spec.dir, baseName));
  if (!fullPath) throw Object.assign(new Error('素材路径越界'), {statusCode: 400});
  return {spec, baseName, ext, fullPath, assetPath: `${spec.prefix}/${baseName}`};
};

const assetResponseForFile = async (kind, spec, filePath) => {
  const info = await stat(filePath);
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  const assetPath = `${spec.prefix}/${name}`;
  return {
    kind,
    name,
    path: assetPath,
    url: `/${assetPath}`,
    bytes: info.size,
    mtime: info.mtimeMs,
    mime: MIME[ext] || 'application/octet-stream',
    mutable: true,
  };
};

const handleAssetRename = async (req, res) => {
  const body = await readJson(req);
  const kind = String(body.kind || '');
  const current = resolveMutableAsset(kind, body.path);
  if (!existsSync(current.fullPath)) return sendJson(res, 404, {ok: false, error: '素材不存在'});

  const requested = String(body.name || '').trim();
  const requestedExt = path.extname(requested);
  const requestedBase = path.basename(requested, requestedExt);
  const nextBase = safeSlug(requestedBase);
  const nextName = `${nextBase}${current.ext}`;
  let targetPath = withinBase(current.spec.dir, path.join(current.spec.dir, nextName));
  if (!targetPath) return sendJson(res, 400, {ok: false, error: '新文件名无效'});
  if (targetPath === current.fullPath) {
    return sendJson(res, 200, {ok: true, kind, asset: await assetResponseForFile(kind, current.spec, current.fullPath)});
  }
  if (existsSync(targetPath)) {
    const fallbackName = `${nextBase}-${Date.now()}-${uniqueSuffix()}${current.ext}`;
    targetPath = withinBase(current.spec.dir, path.join(current.spec.dir, fallbackName));
    if (!targetPath) return sendJson(res, 400, {ok: false, error: '新文件名无效'});
  }

  await rename(current.fullPath, targetPath);
  return sendJson(res, 200, {
    ok: true,
    kind,
    oldPath: current.assetPath,
    asset: await assetResponseForFile(kind, current.spec, targetPath),
  });
};

const handleAssetDelete = async (req, res) => {
  const body = await readJson(req);
  const kind = String(body.kind || '');
  const target = resolveMutableAsset(kind, body.path);
  if (!existsSync(target.fullPath)) return sendJson(res, 404, {ok: false, error: '素材不存在'});
  await unlink(target.fullPath);
  return sendJson(res, 200, {ok: true, kind, deletedPath: target.assetPath});
};

const settingsPayload = () => {
  const sub = currentOutputSubdir();
  return {
    ok: true,
    version: '0.4.0',
    directories: {
      materials: {
        covers: path.join(publicDir, 'covers'),
        backgrounds: path.join(publicDir, 'backgrounds'),
        introVideos: path.join(publicDir, 'intro-videos'),
        audio: path.join(publicDir, 'audio'),
      },
      output: sub.full,
      outputRoot: outDir,
    },
    writable: {
      outputSubdir: {
        value: sub.rel,
        default: DEFAULT_OUTPUT_SUBDIR,
        resolved: sub.full,
        root: outDir,
        maxDepth: MAX_SUBDIR_DEPTH,
        hint: '编辑器单片渲染的输出目录，相对 out/ 可用 / 分层（最多 4 层）；只能字母/数字/中文/下划线/连字符。',
      },
    },
    capabilities: {
      systemOpen: false,
      showInFolder: false,
      webFallback: true,
    },
  };
};

const handleSettings = (res) => sendJson(res, 200, settingsPayload());

const handleSettingsUpdate = async (req, res) => {
  const body = await readJson(req);
  if (!('outputSubdir' in body)) {
    return sendJson(res, 400, {ok: false, error: '缺少 outputSubdir'});
  }
  const sub = parseOutputSubdir(body.outputSubdir); // 非法输入抛 400，由顶层 catch 回受控文案
  const next = {...readSettingsFile(), outputSubdir: sub.rel};
  await mkdir(configDir, {recursive: true});
  await writeFile(settingsFile, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`[settings] 输出子目录 -> ${sub.rel}`);
  return sendJson(res, 200, settingsPayload());
};

const handleAssetUpload = async (req, res) => {
  const body = await readUploadJson(req);
  const kind = String(body.kind || 'covers');
  const spec = UPLOAD_KINDS[kind];
  if (!spec) return sendJson(res, 400, {ok: false, error: '不支持的素材类型'});

  const match = String(body.dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return sendJson(res, 400, {ok: false, error: '缺少 base64 文件数据'});

  const mime = match[1].toLowerCase();
  const extFromMime = spec.mimeToExt[mime];
  if (!extFromMime) return sendJson(res, 400, {ok: false, error: '不支持的文件格式'});

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length <= 0) return sendJson(res, 400, {ok: false, error: '文件为空'});
  if (buffer.length > spec.maxBytes) {
    throw Object.assign(new Error(`文件过大，最大 ${(spec.maxBytes / 1048576).toFixed(1)}MB`), {statusCode: 413});
  }

  const original = String(body.fileName || 'cover');
  const originalExt = path.extname(original).toLowerCase();
  const ext = Object.values(spec.mimeToExt).includes(originalExt) ? originalExt : extFromMime;
  const baseName = safeSlug(path.basename(original, originalExt));
  const fileName = `${baseName}-${Date.now()}-${uniqueSuffix()}${ext}`;
  await mkdir(spec.dir, {recursive: true});
  await writeFile(path.join(spec.dir, fileName), buffer);

  const assetPath = `${spec.prefix}/${fileName}`;
  return sendJson(res, 200, {ok: true, kind, path: assetPath, url: `/${assetPath}`, bytes: buffer.length, mime});
};

const refId = (value) => (typeof value === 'string' && value.startsWith('asset:') ? value.slice('asset:'.length) : null);

const resolvePublicAssetPath = (raw, category) => {
  let value = String(raw || '').trim();
  const id = refId(value);
  if (id) {
    const entry = assets?.[category]?.[id];
    value = typeof entry === 'string' ? entry : entry?.path || '';
  }
  if (!value || /^(https?:|data:|blob:)/i.test(value)) return null;
  const clean = value.replace(/^public[\\/]/, '').replace(/^\/+/, '');
  const full = withinBase(publicDir, path.join(publicDir, clean));
  return full && existsSync(full) ? full : null;
};

const handleBeatsDetect = async (req, res) => {
  const body = await readJson(req);
  const audioPath = resolvePublicAssetPath(body.audio || 'sample-beat.wav', 'audio');
  if (!audioPath) return sendJson(res, 400, {ok: false, error: '音频不存在或不支持远程音频'});

  const fps = Number(body.fps) || 30;
  const start = body.start == null ? 4 : Number(body.start);
  const end = body.end == null ? 7 : Number(body.end);
  const max = body.max == null ? 14 : Number(body.max);
  const minGap = body.minGap == null ? 0.12 : Number(body.minGap);
  const sensitivity = body.sensitivity == null ? 1.5 : Number(body.sensitivity);

  const {sampleRate, samples, duration} = decodeWav(await readFile(audioPath));
  let onsets = detectOnsets(samples, sampleRate, {sensitivity, minGapSec: minGap});
  if (Number.isFinite(start)) onsets = onsets.filter((o) => o.time >= start);
  if (Number.isFinite(end)) onsets = onsets.filter((o) => o.time <= end);
  if (Number.isFinite(max) && max > 0 && onsets.length > max) {
    onsets = [...onsets].sort((x, y) => y.strength - x.strength).slice(0, max);
  }
  onsets.sort((x, y) => x.time - y.time);

  const flashCutFrames = Array.from(new Set(onsetsToFrames(onsets, fps))).sort((x, y) => x - y);
  const times = onsets.map((o) => Number(o.time.toFixed(3)));
  return sendJson(res, 200, {
    ok: true,
    audio: path.relative(publicDir, audioPath),
    duration,
    fps,
    flashCutFrames,
    times,
    count: flashCutFrames.length,
  });
};

const handleCoverLookup = async (req, res) => {
  const body = await readJson(req);
  const title = String(body.title || '').trim();
  if (!title) return sendJson(res, 400, {ok: false, error: '缺少书名'});

  const book = {
    title,
    author: body.author ? String(body.author).trim() : undefined,
    isbn: body.isbn ? String(body.isbn).trim() : null,
    coverQuery: body.coverQuery ? String(body.coverQuery).trim() : undefined,
    coverPath: body.coverPath ? String(body.coverPath).trim() : null,
  };
  const warnings = [];
  const resolved = await resolveBookCover(book, {
    coversDir: path.join(publicDir, 'covers'),
    force: body.force === true,
    log: (message) => console.log(message),
    warn: (message) => {
      warnings.push(message);
      console.warn(message);
    },
  });

  return sendJson(res, 200, {
    ok: true,
    book: resolved,
    coverPath: resolved.resolvedCoverPath,
    coverSource: resolved.coverSource,
    warnings,
  });
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
    if (url === '/api/settings') {
      if (req.method === 'POST') return await handleSettingsUpdate(req, res);
      return handleSettings(res);
    }
    if (url === '/api/assets') return await handleAssets(res);
    if (url === '/api/assets/upload' && req.method === 'POST') return await handleAssetUpload(req, res);
    if (url === '/api/assets/rename' && req.method === 'POST') return await handleAssetRename(req, res);
    if (url === '/api/assets/delete' && req.method === 'POST') return await handleAssetDelete(req, res);
    if (url === '/api/beats/detect' && req.method === 'POST') return await handleBeatsDetect(req, res);
    if (url === '/api/covers/lookup' && req.method === 'POST') return await handleCoverLookup(req, res);
    if (url.startsWith('/api/renders')) return await handleRenders(res);
    if (url === '/api/render' && req.method === 'POST') return await handleRender(req, res);
    if (url === '/api/batches') return await handleBatchesList(res);
    if (url === '/api/batch' && req.method === 'POST') return await handleBatchStart(req, res);
    if (url.startsWith('/api/batch/')) {
      const [jobId, action] = url
        .slice('/api/batch/'.length)
        .split('?')[0]
        .split('/')
        .map((part) => decodeURIComponent(part));
      if (!action && req.method === 'GET') return handleBatchStatus(res, jobId);
      if (action === 'pause' && req.method === 'POST') return handleBatchPause(res, jobId);
      if (action === 'resume' && req.method === 'POST') return handleBatchResume(res, jobId);
      if (action === 'retry' && req.method === 'POST') return await handleBatchRetry(req, res, jobId);
    }

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
    // 异常路径下请求体可能未读完（如 413 pause），显式关闭连接，
    // 避免客户端复用这条「脏」的 keep-alive 连接导致下次请求失败。
    res.setHeader('Connection', 'close');
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
