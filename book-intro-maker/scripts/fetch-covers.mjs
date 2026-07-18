import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const configPath = path.join(root, 'config', 'books.example.json');
const coversDir = path.join(root, 'public', 'covers');
const outputPath = path.join(root, 'config', 'books.resolved.json');

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const fetchJson = async (url) => {
  const response = await fetch(url, {headers: {'user-agent': 'ShipinMUBAN/0.1'}});
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
};

const findOpenLibraryCover = async (book) => {
  if (book.isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-L.jpg`;
  }

  const query = new URLSearchParams({
    title: book.title,
    author: book.author || '',
    limit: '1',
  });
  const data = await fetchJson(`https://openlibrary.org/search.json?${query}`);
  const first = data.docs?.[0];
  if (first?.cover_i) {
    return `https://covers.openlibrary.org/b/id/${first.cover_i}-L.jpg`;
  }
  return null;
};

const findGoogleBooksCover = async (book) => {
  const q = book.isbn ? `isbn:${book.isbn}` : `${book.title} ${book.author || ''}`;
  const query = new URLSearchParams({q, maxResults: '1'});
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${query}`);
  const links = data.items?.[0]?.volumeInfo?.imageLinks;
  return links?.extraLarge || links?.large || links?.medium || links?.thumbnail || null;
};

const download = async (url, filePath) => {
  const response = await fetch(url, {headers: {'user-agent': 'ShipinMUBAN/0.1'}});
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
};

const resolveBook = async (book) => {
  if (book.coverPath) {
    return {...book, resolvedCoverPath: book.coverPath, coverSource: 'local'};
  }

  const fileName = `${slug(book.isbn || `${book.title}-${book.author || ''}`)}.jpg`;
  const localPath = path.join(coversDir, fileName);
  const publicPath = `covers/${fileName}`;

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
      await download(url, localPath);
      return {...book, resolvedCoverPath: publicPath, coverSource: source, coverUrl: url};
    } catch (error) {
      console.warn(`[cover] ${book.title}: ${source} failed: ${error.message}`);
    }
  }

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
  console.log(`Wrote ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
