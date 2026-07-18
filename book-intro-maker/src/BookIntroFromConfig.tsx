// 批量渲染入口 composition。
//
// 与 `BookIntroConfig`（props 已是构建好的 BookIntroProps）不同，本 composition 接收
// 「原始三件套配置」`{books, subtitles, intro}` 作为 props，在组件内部用 `propsFromRaw`
// 转换。批量生产脚本据此为每条视频只需传入原始配置作为 inputProps，映射逻辑不必在
// Node 侧重复实现。时长由 `calculateMetadata` 按 props 动态推算。

import React from 'react';
import type {CalculateMetadataFunction} from 'remotion';
import {BookIntroVideo} from './BookIntro';
import {durationForProps, propsFromRaw} from './config';
import type {RawConfigInput} from './config';

export const BookIntroFromConfig: React.FC<RawConfigInput> = (raw) => {
  const props = propsFromRaw(raw);
  return <BookIntroVideo {...props} />;
};

export const calcConfigMetadata: CalculateMetadataFunction<RawConfigInput> = ({props}) => {
  return {
    durationInFrames: durationForProps(propsFromRaw(props)),
  };
};
