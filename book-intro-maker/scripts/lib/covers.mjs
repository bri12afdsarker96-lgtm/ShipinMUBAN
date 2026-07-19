import {access, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {coverSlug as slug} from './cover-path.mjs';

export const DEFAULT_COVER_TIMEOUT_MS = 12000;
export const MIN_IMAGE_BYTES = 1024;

const USER_AGENT = 'ShipinMUBAN/0.2 (+cover-fetch)';

export const fileExists = async (filePath) => {
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

const fetchWithCurl = async (url, init = {}, options = {}) => {
  const timeoutMs = options.timeoutMs || DEFAULT_COVER_TIMEOUT_MS;
  const proxy = proxyForCurl();
  const tempFile = path.join(tmpdir(), `shipin-cover-${randomUUID()}`);
  const headers = {'user-agent': USER_AGENT, ...(init.headers || {})};
  const args = ['-L', '--silent', '--show-error', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-o', tempFile, '-w', '%{http_code}'];

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

export const fetchWithTimeout = async (url, init = {}, options = {}) => {
  const timeoutMs = options.timeoutMs || DEFAULT_COVER_TIMEOUT_MS;
  if (proxyForCurl()) {
    return fetchWithCurl(url, init, {timeoutMs});
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {'user-agent': USER_AGENT, ...(init.headers || {})},
    });
  } catch (error) {
    try {
      return await fetchWithCurl(url, init, {timeoutMs});
    } catch {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
};

const fetchJson = async (url, options) => {
  const response = await fetchWithTimeout(url, {}, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
};

const searchTerm = (book) => book.coverQuery || `${book.title} ${book.author || ''}`.trim();

const findOpenLibraryCover = async (book, options) => {
  if (book.isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-L.jpg?default=false`;
  }
  const query = new URLSearchParams({q: searchTerm(book), limit: '1'});
  const data = await fetchJson(`https://openlibrary.org/search.json?${query}`, options);
  const first = data.docs?.[0];
  if (first?.cover_i) {
    return `https://covers.openlibrary.org/b/id/${first.cover_i}-L.jpg`;
  }
  if (first?.isbn?.[0]) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(first.isbn[0])}-L.jpg?default=false`;
  }
  return null;
};

const findGoogleBooksCover = async (book, options) => {
  const q = book.isbn ? `isbn:${book.isbn}` : searchTerm(book);
  const query = new URLSearchParams({q, maxResults: '1'});
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${query}`, options);
  const links = data.items?.[0]?.volumeInfo?.imageLinks;
  const url = links?.extraLarge || links?.large || links?.medium || links?.small || links?.thumbnail || null;
  return url ? url.replace(/^http:/, 'https:').replace('&edge=curl', '') : null;
};

const download = async (url, filePath, options) => {
  const response = await fetchWithTimeout(url, {}, options);
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

export const resolveBookCover = async (book, options = {}) => {
  const coversDir = options.coversDir;
  if (!coversDir) throw new Error('缺少 coversDir');

  if (book.coverPath) {
    return {...book, resolvedCoverPath: book.coverPath, coverSource: 'local'};
  }

  const fileName = `${slug(book.isbn || `${book.title}-${book.author || ''}`)}.jpg`;
  const localPath = path.join(coversDir, fileName);
  const publicPath = `covers/${fileName}`;

  if (!options.force && (await fileExists(localPath))) {
    options.log?.(`[cover] ${book.title}: 命中缓存 ${publicPath}`);
    return {...book, resolvedCoverPath: publicPath, coverSource: 'cache'};
  }

  const attempts = [
    ['open-library', () => findOpenLibraryCover(book, options)],
    ['google-books', () => findGoogleBooksCover(book, options)],
  ];

  for (const [source, getter] of attempts) {
    try {
      const url = await getter();
      if (!url) {
        continue;
      }
      const size = await download(url, localPath, options);
      options.log?.(`[cover] ${book.title}: ${source} ✓ (${size}B) -> ${publicPath}`);
      return {...book, resolvedCoverPath: publicPath, coverSource: source, coverUrl: url};
    } catch (error) {
      options.warn?.(`[cover] ${book.title}: ${source} 失败: ${error.message}`);
    }
  }

  options.warn?.(`[cover] ${book.title}: 未找到真实封面，降级为生成式占位封面`);
  return {...book, resolvedCoverPath: null, coverSource: 'placeholder'};
};

export const resolveBooksConfigCovers = async (config, options) => {
  await mkdir(options.coversDir, {recursive: true});
  const flashBooks = [];
  for (const book of config.flashBooks || []) {
    flashBooks.push(await resolveBookCover(book, options));
  }
  const mainBook = config.mainBook ? await resolveBookCover(config.mainBook, options) : null;
  return {...config, flashBooks, mainBook};
};
