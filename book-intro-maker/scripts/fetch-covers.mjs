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

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {resolveBooksConfigCovers} from './lib/covers.mjs';

const root = process.cwd();
const configPath = path.join(root, 'config', 'books.example.json');
const coversDir = path.join(root, 'public', 'covers');
const outputPath = path.join(root, 'config', 'books.resolved.json');

const FORCE = process.argv.includes('--force');

const main = async () => {
  await mkdir(coversDir, {recursive: true});
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const resolved = await resolveBooksConfigCovers(config, {
    coversDir,
    force: FORCE,
    log: console.log,
    warn: console.warn,
  });

  await writeFile(outputPath, `${JSON.stringify(resolved, null, 2)}\n`, 'utf8');

  const all = [...(resolved.flashBooks || []), ...(resolved.mainBook ? [resolved.mainBook] : [])];
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
