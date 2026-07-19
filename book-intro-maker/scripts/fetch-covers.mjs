// 真实书封查询与缓存脚本。
//
// 策略（与 docs/phase-2-spec.md 一致）：
//   1. 配置有 coverPath  -> 直接用本地覆盖。
//   2. 目标文件已缓存      -> 跳过联网（可重复运行，不重复下载）。
//   3. 有 isbn            -> 优先按 ISBN 查（Open Library 加 default=false 避免空白占位图）。
//   4. 否则               -> 用 coverQuery 或「书名 + 作者」查。
//   5. Open Library 优先，Google Books 补充。
//   6. 都找不到           -> 标记 placeholder，交给模板降级为生成式封面，绝不中断。
//
// 输出解析后的 config/books.resolved.json，供下游/产品阶段使用。
// 用法：
//   node scripts/fetch-covers.mjs            正常运行（利用缓存）
//   node scripts/fetch-covers.mjs --force    忽略缓存，强制重新下载

import {access, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {coverSlug as slug} from './lib/cover-path.mjs';

const root = process.cwd();
const configPath = path.join(root, 'config', 'books.example.json');
const coversDir = path.join(root, 'public', 'covers');
const outputPath = path.join(root, 'config', 'books.resolved.json');

const FORCE = process.argv.includes('--force');
const TIMEOUT_MS = 12000;
const MIN_IMAGE_BYTES = 1024; // 小于该阈值大概率是空白/占位图，视为无效。
const USER_AGENT = 'ShipinMUBAN/0.2 (+cover-fetch)';

const fileExists = async (filePath) => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

let cachedProxy = undefined;
let announcedProxy = false;

const normalizeProxy = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const parseProxyServer = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!raw.includes(';')) return normalizeProxy(raw);

  const entries = raw.split(';').map((item) => item.trim()).filter(Boolean);
  const preferred = entries.find((item) => item.toLowerCase().startsWith('https=')) || entries.find((item) => item.toLowerCase().startsWith('http=')) || entries[0];
  return normalizeProxy(preferred.includes('=') ? preferred.split('=').slice(1).join('=') : preferred);
};

const readWindowsUserProxy = () => {
  if (process.platform !== 'win32') return null;
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  try {
    const enabled = spawnSync('reg', ['query', key, '/v', 'ProxyEnable'], {encoding: 'utf8'});
    if (enabled.status !== 0 || !/ProxyEnable\s+REG_DWORD\s+0x1/i.test(enabled.stdout)) {
      return null;
    }
    const server = spawnSync('reg', ['query', key, '/v', 'ProxyServer'], {encoding: 'utf8'});
    if (server.status !== 0) return null;
    const match = server.stdout.match(/ProxyServer\s+REG_\w+\s+(.+)/i);
    return parseProxyServer(match?.[1]);
  } catch {
    return null;
  }
};

const displayProxy = (proxy) => {
  try {
    const url = new URL(proxy);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return proxy;
  }
};

const proxyForCurl = () => {
  if (cachedProxy !== undefined) return cachedProxy;
  cachedProxy =
    normalizeProxy(process.env.COVER_PROXY) ||
    normalizeProxy(process.env.HTTPS_PROXY) ||
    normalizeProxy(process.env.HTTP_PROXY) ||
    normalizeProxy(process.env.ALL_PROXY) ||
    readWindowsUserProxy();
  return cachedProxy;
};

const spawnFileBuffer = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {windowsHide: true});
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr)}));
  });

const responseFromBuffer = ({status, buffer}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'curl',
  arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  json: async () => JSON.parse(buffer.toString('utf8')),
});

const fetchWithCurl = async (url, init = {}) => {
  const proxy = proxyForCurl();
  const tempFile = path.join(tmpdir(), `shipin-cover-${randomUUID()}`);
  const headers = {'user-agent': USER_AGENT, ...(init.headers || {})};
  const args = ['-L', '--silent', '--show-error', '--max-time', String(Math.ceil(TIMEOUT_MS / 1000)), '-o', tempFile, '-w', '%{http_code}'];

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }
  if (proxy) {
    if (!announcedProxy) {
      console.log(`[cover] 使用代理回退：${displayProxy(proxy)}`);
      announcedProxy = true;
    }
    args.push('--proxy', proxy);
  }
  args.push(url);

  const command = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const result = await spawnFileBuffer(command, args);
  const status = Number(result.stdout.toString('utf8').trim().match(/(\d{3})$/)?.[1] || 0);
  const buffer = await readFile(tempFile).catch(() => Buffer.alloc(0));
  await rm(tempFile, {force: true}).catch(() => {});

  if (result.code !== 0) {
    const detail = result.stderr.toString('utf8').trim() || `HTTP ${status || '000'}`;
    throw new Error(`curl 失败: ${detail}`);
  }
  return responseFromBuffer({status, buffer});
};

const fetchWithTimeout = async (url, init = {}) => {
  if (proxyForCurl()) {
    return fetchWithCurl(url, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {'user-agent': USER_AGENT, ...(init.headers || {})},
    });
  } catch (error) {
    try {
      return await fetchWithCurl(url, init);
    } catch {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
};

const fetchJson = async (url) => {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
};

const searchTerm = (book) => book.coverQuery || `${book.title} ${book.author || ''}`.trim();

const findOpenLibraryCover = async (book) => {
  if (book.isbn) {
    // default=false 时，无封面会返回 404 而不是空白占位图。
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-L.jpg?default=false`;
  }
  const query = new URLSearchParams({q: searchTerm(book), limit: '1'});
  const data = await fetchJson(`https://openlibrary.org/search.json?${query}`);
  const first = data.docs?.[0];
  if (first?.cover_i) {
    return `https://covers.openlibrary.org/b/id/${first.cover_i}-L.jpg`;
  }
  if (first?.isbn?.[0]) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(first.isbn[0])}-L.jpg?default=false`;
  }
  return null;
};

const findGoogleBooksCover = async (book) => {
  const q = book.isbn ? `isbn:${book.isbn}` : searchTerm(book);
  const query = new URLSearchParams({q, maxResults: '1'});
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${query}`);
  const links = data.items?.[0]?.volumeInfo?.imageLinks;
  const url = links?.extraLarge || links?.large || links?.medium || links?.small || links?.thumbnail || null;
  // Google 缩略图默认走 http，且带缩放参数，统一升级为 https 并去掉边缘。
  return url ? url.replace(/^http:/, 'https:').replace('&edge=curl', '') : null;
};

const download = async (url, filePath) => {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < MIN_IMAGE_BYTES) {
    throw new Error(`封面过小（${buffer.byteLength}B），疑似空白占位图`);
  }
  await writeFile(filePath, buffer);
  return buffer.byteLength;
};

const resolveBook = async (book) => {
  if (book.coverPath) {
    return {...book, resolvedCoverPath: book.coverPath, coverSource: 'local'};
  }

  const fileName = `${slug(book.isbn || `${book.title}-${book.author || ''}`)}.jpg`;
  const localPath = path.join(coversDir, fileName);
  const publicPath = `covers/${fileName}`;

  if (!FORCE && (await fileExists(localPath))) {
    console.log(`[cover] ${book.title}: 命中缓存 ${publicPath}`);
    return {...book, resolvedCoverPath: publicPath, coverSource: 'cache'};
  }

  const attempts = [
    ['open-library', () => findOpenLibraryCover(book)],
    ['google-books', () => findGoogleBooksCover(book)],
  ];

  for (const [source, getter] of attempts) {
    try {
      const url = await getter();
      if (!url) {
        continue;
      }
      const size = await download(url, localPath);
      console.log(`[cover] ${book.title}: ${source} ✓ (${size}B) -> ${publicPath}`);
      return {...book, resolvedCoverPath: publicPath, coverSource: source, coverUrl: url};
    } catch (error) {
      console.warn(`[cover] ${book.title}: ${source} 失败: ${error.message}`);
    }
  }

  console.warn(`[cover] ${book.title}: 未找到真实封面，降级为生成式占位封面`);
  return {...book, resolvedCoverPath: null, coverSource: 'placeholder'};
};

const main = async () => {
  await mkdir(coversDir, {recursive: true});
  const config = JSON.parse(await readFile(configPath, 'utf8'));

  const flashBooks = [];
  for (const book of config.flashBooks || []) {
    flashBooks.push(await resolveBook(book));
  }
  const mainBook = config.mainBook ? await resolveBook(config.mainBook) : null;

  const resolved = {...config, flashBooks, mainBook};
  await writeFile(outputPath, `${JSON.stringify(resolved, null, 2)}\n`, 'utf8');

  const all = [...flashBooks, ...(mainBook ? [mainBook] : [])];
  const counts = all.reduce((acc, b) => {
    acc[b.coverSource] = (acc[b.coverSource] || 0) + 1;
    return acc;
  }, {});
  console.log(`\n完成：${outputPath}`);
  console.log(`统计：${JSON.stringify(counts)}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
