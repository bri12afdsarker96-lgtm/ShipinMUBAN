// 开场层组件。
//
// 支持两种开场：
//   - `mode: 'video'`     使用本地视频素材，可裁剪起止、调音量、静音。
//   - `mode: 'generated'` 使用生成式背景（雪花 + 人物剪影 + 渐变），无需任何素材。
//
// 当 `mode` 为 video 但未提供 `videoPath` 时，自动降级为生成式背景，保证缺素材时
// 依然能渲染。字幕不在这里渲染——已抽离到独立的 `SubtitleTrack` 覆盖层。

import React from 'react';
import {Video} from '@remotion/media';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import type {IntroConfig} from '../configSchema';
import {resolveSrc} from '../media';
import {CoverImage} from './CoverImage';

const WIDTH = 720;
const HEIGHT = 1280;

const SnowField: React.FC = () => {
  const frame = useCurrentFrame();
  const flakes = Array.from({length: 46}, (_, i) => {
    const x = (i * 83) % WIDTH;
    const y = (i * 211 + frame * (1.8 + (i % 5) * 0.28)) % HEIGHT;
    const size = 2 + (i % 4);
    const opacity = 0.2 + (i % 7) * 0.08;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: 999,
          background: `rgba(255,255,255,${opacity})`,
          boxShadow: '0 0 10px rgba(255,255,255,0.35)',
        }}
      />
    );
  });

  return <>{flakes}</>;
};

/** 生成式开场背景：不依赖任何外部素材。 */
const GeneratedIntroFallback: React.FC = () => {
  const frame = useCurrentFrame();
  const pan = interpolate(frame, [0, 134], [0, -34], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{background: '#101419', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: -60,
          transform: `translateX(${pan}px) scale(1.04)`,
          background:
            'linear-gradient(90deg, rgba(28,48,57,0.96), rgba(213,226,226,0.92) 46%, rgba(117,134,132,0.94)), radial-gradient(circle at 72% 22%, rgba(255,255,255,0.9), transparent 23%), linear-gradient(0deg, #6d2020, #6d2020)',
          filter: 'saturate(0.82) contrast(1.05)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 82,
          top: 220,
          width: 520,
          height: 580,
          borderRadius: '46% 46% 38% 38%',
          background:
            'radial-gradient(circle at 50% 18%, #1a1715 0 36px, transparent 37px), radial-gradient(circle at 50% 27%, #f3c0a4 0 78px, transparent 79px), linear-gradient(160deg, #4f6971 0 56%, #263a43 57%)',
          boxShadow: '0 26px 70px rgba(0,0,0,0.32)',
          opacity: 0.92,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -80,
          right: -80,
          bottom: 0,
          height: 410,
          background: 'linear-gradient(0deg, rgba(6,8,12,0.9), rgba(6,8,12,0))',
        }}
      />
    </AbsoluteFill>
  );
};

const IntroBrand: React.FC<{text?: string}> = ({text}) =>
  text ? (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 70,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.55)',
        fontSize: 16,
      }}
    >
      {text}
    </div>
  ) : null;

const GeneratedIntro: React.FC<{intro: IntroConfig}> = ({intro}) => (
  <AbsoluteFill style={{background: '#101419', overflow: 'hidden'}}>
    <CoverImage src={intro.backgroundPath} fallback={<GeneratedIntroFallback />} />
    <div
      style={{
        position: 'absolute',
        left: -80,
        right: -80,
        bottom: 0,
        height: 410,
        background: 'linear-gradient(0deg, rgba(6,8,12,0.9), rgba(6,8,12,0))',
      }}
    />
    <SnowField />
    <IntroBrand text={intro.brandText} />
  </AbsoluteFill>
);

/** 本地视频开场，支持裁剪起止（秒）、音量、静音。 */
const VideoIntro: React.FC<{intro: IntroConfig; videoPath: string}> = ({intro, videoPath}) => {
  const {fps} = useVideoConfig();
  const trimBefore = Math.max(0, Math.round(intro.trimStart * fps));
  const trimAfter =
    intro.trimEnd !== null && intro.trimEnd > intro.trimStart
      ? Math.round(intro.trimEnd * fps)
      : undefined;

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Video
        src={resolveSrc(videoPath)}
        trimBefore={trimBefore}
        trimAfter={trimAfter}
        volume={intro.muted ? 0 : intro.volume}
        muted={intro.muted}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
    </AbsoluteFill>
  );
};

export const IntroLayer: React.FC<{intro: IntroConfig}> = ({intro}) => {
  if (intro.mode === 'video' && intro.videoPath) {
    return <VideoIntro intro={intro} videoPath={intro.videoPath} />;
  }
  return <GeneratedIntro intro={intro} />;
};
