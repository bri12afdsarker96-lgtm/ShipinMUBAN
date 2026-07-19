// 封面路径约定（Node 侧）。
//
// 必须与 src/config.ts 的 coverSlug / conventionCoverPath 保持一致，
// 否则脚本下载的文件名会和模板算出的约定路径对不上。

export const coverSlug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** 根据书籍信息推导封面在 public/covers/ 下的约定路径（相对 public）。 */
export const conventionCoverPath = (book) => {
  const key = book.isbn || `${book.title}-${book.author || ''}`;
  return `covers/${coverSlug(key)}.jpg`;
};
