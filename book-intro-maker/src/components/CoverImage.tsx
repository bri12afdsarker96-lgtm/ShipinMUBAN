// 封面图片组件，带降级能力。
//
// 优先加载真实封面（`public/covers/` 下的下载文件或本地覆盖），加载失败或没有路径
// 时退回到 `fallback`（通常是参数化生成的图形封面）。这样即使封面缺失或没联网，
// 渲染也不会中断——满足「缺封面必须降级、不能阻断渲染」的约束。

import React, {useState} from 'react';
import {Img} from 'remotion';
import {resolveSrc} from '../media';

export const CoverImage: React.FC<{
  src: string | null;
  fallback: React.ReactNode;
  style?: React.CSSProperties;
}> = ({src, fallback, style}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return (
    <Img
      src={resolveSrc(src)}
      // 提供 onError 后，Remotion 不会因为图片 404 而让整个渲染失败，
      // 而是切换到生成式占位封面。
      onError={() => setFailed(true)}
      style={{width: '100%', height: '100%', objectFit: 'cover', ...style}}
    />
  );
};
