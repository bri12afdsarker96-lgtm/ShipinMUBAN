// 极简并发池：最多 concurrency 个 worker 同时执行，保持结果顺序。
export const runPool = async (items, worker, concurrency = 1) => {
  const results = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(concurrency, items.length || 1));
  const runners = Array.from({length: size}, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};
