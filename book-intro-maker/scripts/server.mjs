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

const root = process.cwd();
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

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const safeSlug = (value) =>
  String(value || '')
    .replace(/[^a-zA-Z0-9一-龥_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'editor';

// —— 静态文件：依次在 dist / public / out 目录查找 ——
const resolveStatic = (urlPath) => {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (clean === '' ) return path.join(distDir, 'index.html');
  if (clean.startsWith('out/')) return path.join(root, clean);
  for (const base of [distDir, publicDir]) {
    const p = path.join(base, clean);
    if (p.startsWith(base) && existsSync(p)) return p;
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
  const raw = JSON.parse(await readBody(req));
  const id = safeSlug(raw.id || raw.mainTitle || 'editor');
  const fileName = `${id}-${Date.now()}.mp4`;
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

const handleAssets = async (res) => {
  const p = path.join(root, 'config', 'assets.example.json');
  if (!existsSync(p)) return sendJson(res, 200, {});
  return sendJson(res, 200, JSON.parse(await readFile(p, 'utf8')));
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      return res.end();
    }
    const url = req.url || '/';
    if (url === '/api/health') return sendJson(res, 200, {ok: true});
    if (url === '/api/assets') return handleAssets(res);
    if (url.startsWith('/api/renders')) return handleRenders(res);
    if (url === '/api/render' && req.method === 'POST') return handleRender(req, res);

    const filePath = resolveStatic(url);
    if (!filePath) {
      cors(res);
      res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
      return res.end('Not Found');
    }
    return serveStatic(res, filePath);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {ok: false, error: error.message});
  }
});

server.listen(PORT, '127.0.0.1', () => {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    console.warn('提示：未找到 gui/dist，请先运行 npm run gui:build');
  }
  console.log(`编辑器服务：http://127.0.0.1:${PORT}`);
});
