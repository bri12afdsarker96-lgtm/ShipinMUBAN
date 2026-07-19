// 静态资源路径解析工具。
import {staticFile} from 'remotion';

/**
 * 相对路径按 Remotion 静态资源（`public/`）解析；http/data/blob 链接原样返回。
 * 允许配置写 `covers/x.jpg`、`public/covers/x.jpg` 或 `/covers/x.jpg`。
 */
export const resolveSrc = (raw: string): string => {
  if (/^(https?:|data:|blob:)/i.test(raw)) {
    return raw;
  }
  return staticFile(raw.replace(/^public\//, '').replace(/^\/+/, ''));
};
