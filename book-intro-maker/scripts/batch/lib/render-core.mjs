// 渲染核心：批量引擎与本地服务共用。
// 打包一次并缓存 serveUrl，之后对每条 inputProps 渲染。

import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

export const COMPOSITION_ID = 'BookIntroFromConfig';

let bundlePromise = null;

/** 打包 Remotion 项目（缓存 in-flight Promise，进程内只打一次；并发调用不会重复打包）。 */
export const getBundle = (root) => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(root, 'src', 'index.ts'),
      publicDir: path.join(root, 'public'),
    }).catch((error) => {
      bundlePromise = null; // 打包失败时允许后续重试
      throw error;
    });
  }
  return bundlePromise;
};

/** 渲染一条：inputProps 为原始三件套 + template/audio。带失败重试。 */
export const renderJob = async ({serveUrl, inputProps, outputPath, browserExecutable, retries = 1}) => {
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const composition = await selectComposition({serveUrl, id: COMPOSITION_ID, inputProps, browserExecutable});
      await renderMedia({serveUrl, composition, codec: 'h264', outputLocation: outputPath, inputProps, browserExecutable});
      return {ok: true, attempts: attempt};
    } catch (error) {
      lastError = error;
    }
  }
  return {ok: false, attempts: retries + 1, error: lastError?.message || String(lastError)};
};
