// 独立字幕轨道组件。
//
// 把原本写死在开场场景里的中英字幕抽离成通用轨道：由 `SubtitleItem[]` 驱动，
// 支持中英双语、位置（上/中/下）、颜色、字号、字重和阴影。整条轨道作为覆盖层
// 叠加在画面之上，可覆盖开场、书封快闪和主书任意时间段。

import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import type {SubtitleItem, SubtitlePosition} from '../configSchema';

/** 位置到竖向定位样式的映射（竖屏 720x1280）。 */
const positionStyle = (position: SubtitlePosition): React.CSSProperties => {
  switch (position) {
    case 'upper':
      return {top: 150};
    case 'center':
      return {top: 540};
    case 'lower':
    default:
      return {bottom: 318};
  }
};

/** 进入 6 帧淡入 + 上移，退出 6 帧淡出。 */
const useCaptionOpacity = (item: SubtitleItem): {opacity: number; lift: number} => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [item.startFrame, item.startFrame + 6], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(frame, [item.endFrame - 6, item.endFrame], [1, 0], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return {opacity: enter * exit, lift: (1 - enter) * 16};
};

const SubtitleCaption: React.FC<{item: SubtitleItem}> = ({item}) => {
  const {opacity, lift} = useCaptionOpacity(item);
  const {style} = item;

  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        right: 56,
        textAlign: 'center',
        opacity,
        transform: `translateY(${lift}px)`,
        ...positionStyle(item.position),
      }}
    >
      {item.zh ? (
        <div
          style={{
            color: style.zhColor,
            fontSize: style.zhFontSize,
            lineHeight: 1.18,
            fontWeight: style.zhFontWeight,
            textShadow: style.shadow,
          }}
        >
          {item.zh}
        </div>
      ) : null}
      {item.en ? (
        <div
          style={{
            marginTop: 8,
            color: style.enColor,
            fontSize: style.enFontSize,
            lineHeight: 1.25,
            fontWeight: style.enFontWeight,
            textShadow: style.shadow,
          }}
        >
          {item.en}
        </div>
      ) : null}
    </div>
  );
};

export const SubtitleTrack: React.FC<{tracks: SubtitleItem[]}> = ({tracks}) => {
  const frame = useCurrentFrame();
  // 只渲染当前帧命中的字幕，避免大量离屏节点。
  const visible = tracks.filter((item) => frame >= item.startFrame && frame <= item.endFrame);

  if (visible.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill>
      {visible.map((item) => (
        <SubtitleCaption key={item.id} item={item} />
      ))}
    </AbsoluteFill>
  );
};
