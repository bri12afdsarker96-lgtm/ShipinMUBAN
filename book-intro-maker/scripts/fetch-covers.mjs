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

import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const configPath = path.join(root, 'config', 'books.example.json');
const coversDir = path.join(root, 'public', 'covers');
const outputPath = path.join(root, 'config', 'books.resolved.json');

const FORCE = process.argv.includes('--force');
const TIMEOUT_MS = 12000;
const MIN_IMAGE_BYTES = 1024; // 小于该阈值大概率是空白/占位图，视为无效。

// 注意：slug 必须与 src/config.ts 的 coverSlug 保持一致。
const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const fileExists = async (filePath) => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const fetchWithTimeout = async (url, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {'user-agent': 'ShipinMUBAN/0.2 (+cover-fetch)', ...(init.headers || {})},
    });
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
