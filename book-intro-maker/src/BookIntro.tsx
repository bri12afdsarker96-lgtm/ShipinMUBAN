// 书籍开场模板主组件。
//
// 阶段二重构：模板不再直接依赖写死的 `samplePreset`，而是消费统一的 `BookIntroProps`
// （由 `config.ts` 从配置文件或样片适配而来）。三块能力被拆成独立组件：
//   - `IntroLayer`     开场（本地视频或生成式背景）。
//   - `BookFlashSequence` 书封快闪，真实封面加载失败时降级为图形封面。
//   - `MainBookScene`  主书氛围页，支持自定义背景、封面、主字幕。
//   - `SubtitleTrack`  独立字幕轨道覆盖层。
//
// 所有动画都用 `useCurrentFrame()` + `interpolate()` + 显式帧号驱动。

import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {IntroLayer} from './components/IntroLayer';
import {SubtitleTrack} from './components/SubtitleTrack';
import {CoverImage} from './components/CoverImage';
import type {BookCoverCardData, BookIntroProps, MainBookData} from './config';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const cutDistance = (frame: number, cuts: number[]) => Math.min(...cuts.map((cut) => Math.abs(frame - cut)));

const pulseForCuts = (frame: number, cuts: number[]) => clamp(1 - cutDistance(frame, cuts) / 4, 0, 1);

const activeIndexFromCuts = (frame: number, cuts: number[]) => {
  let index = 0;
  for (let i = 0; i < cuts.length; i++) {
    if (frame >= cuts[i]) {
      index = i;
    }
  }
  return index;
};

// —— 生成式图形封面（真实封面缺失时的降级方案）——————————————————————————

const CoverMotif: React.FC<{card: Pick<BookCoverCardData, 'palette' | 'motif'>}> = ({card}) => {
  const [, b, c] = card.palette;
  if (card.motif === 'moon') {
    return (
      <>
        <div style={{position: 'absolute', width: 210, height: 210, borderRadius: 999, right: 58, top: 132, border: `34px solid ${b}`, boxShadow: `0 0 34px ${b}`}} />
        <div style={{position: 'absolute', width: 20, height: 20, borderRadius: 999, right: 240, top: 280, background: b}} />
      </>
    );
  }
  if (card.motif === 'portrait') {
    return (
      <>
        <div style={{position: 'absolute', left: 78, top: 194, width: 210, height: 290, borderRadius: '48% 48% 6px 6px', background: c, boxShadow: '0 14px 30px rgba(0,0,0,0.35)'}} />
        <div style={{position: 'absolute', left: 126, top: 118, width: 112, height: 112, borderRadius: 999, background: b}} />
      </>
    );
  }
  if (card.motif === 'waves') {
    return (
      <>
        {Array.from({length: 6}, (_, i) => (
          <div key={i} style={{position: 'absolute', left: -20, right: -20, top: 228 + i * 42, height: 20, borderRadius: 999, borderTop: `5px solid ${i % 2 === 0 ? b : c}`, transform: `rotate(${i % 2 === 0 ? -4 : 3}deg)`}} />
        ))}
      </>
    );
  }
  if (card.motif === 'city') {
    return (
      <>
        {Array.from({length: 7}, (_, i) => (
          <div key={i} style={{position: 'absolute', bottom: 94, left: 36 + i * 58, width: 36, height: 150 + (i % 4) * 48, background: i % 2 ? b : c, opacity: 0.88}} />
        ))}
      </>
    );
  }
  if (card.motif === 'shadow') {
    return (
      <>
        <div style={{position: 'absolute', inset: 0, background: `linear-gradient(135deg, transparent 0 42%, ${b} 43% 44%, transparent 45%)`, opacity: 0.7}} />
        <div style={{position: 'absolute', left: 108, top: 156, width: 210, height: 380, borderRadius: 18, border: `5px solid ${b}`, transform: 'rotate(-9deg)'}} />
      </>
    );
  }
  return (
    <>
      {Array.from({length: 8}, (_, i) => (
        <div key={i} style={{position: 'absolute', left: i * 62 - 70, top: 120 + (i % 3) * 80, width: 160, height: 280, background: i % 2 ? b : c, opacity: 0.32, transform: `rotate(${i % 2 ? -18 : 18}deg)`}} />
      ))}
    </>
  );
};

/** 参数化生成的书封（gradient + 图形 + 书名），作为真实封面的降级。 */
const GeneratedCover: React.FC<{card: BookCoverCardData}> = ({card}) => {
  const [a, b, c] = card.palette;
  return (
    <div style={{position: 'absolute', inset: 0, background: `linear-gradient(145deg, ${a}, ${c})`}}>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 72% 18%, ${b}, transparent 28%), linear-gradient(0deg, rgba(0,0,0,0.36), transparent 48%)`}} />
      <CoverMotif card={card} />
      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 34,
          right: 34,
          color: '#fff',
          textAlign: 'center',
          fontSize: 34,
          lineHeight: 1.15,
          fontWeight: 800,
          textShadow: '0 3px 18px rgba(0,0,0,0.72)',
        }}
      >
        《{card.title}》
      </div>
      {card.author ? (
        <div
          style={{
            position: 'absolute',
            top: 128,
            left: 40,
            right: 40,
            color: 'rgba(255,255,255,0.86)',
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {card.author}
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 44, right: 44, bottom: 58, height: 2, background: 'rgba(255,255,255,0.58)'}} />
    </div>
  );
};

const BookCoverCard: React.FC<{card: BookCoverCardData; pulse: number}> = ({card, pulse}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 100,
        top: 170,
        width: 520,
        height: 770,
        borderRadius: 10,
        overflow: 'hidden',
        background: '#050505',
        boxShadow: `0 ${36 + pulse * 12}px ${70 + pulse * 30}px rgba(0,0,0,0.48)`,
        transform: `scale(${1 + pulse * 0.035})`,
      }}
    >
      {/* 真实封面优先，加载失败降级到生成式图形封面。 */}
      <CoverImage src={card.coverPath} fallback={<GeneratedCover card={card} />} />
    </div>
  );
};

const BookFlashSequence: React.FC<{cuts: number[]; bookCards: BookCoverCardData[]}> = ({cuts, bookCards}) => {
  const frame = useCurrentFrame();
  const active = activeIndexFromCuts(frame, cuts);
  const coverIndex = clamp(active, 0, bookCards.length - 1);
  const pulse = pulseForCuts(frame, cuts);
  const card = bookCards[coverIndex];
  const fade = interpolate(frame, [cuts[0] - 4, cuts[0]], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (!card) {
    return null;
  }

  return (
    <AbsoluteFill style={{background: '#050505', opacity: fade}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 42%, ${card.palette[0]}55, transparent 45%), #050505`,
        }}
      />
      <BookCoverCard card={card} pulse={pulse} />
      <div style={{position: 'absolute', inset: 0, opacity: pulse * 0.32, background: 'white', mixBlendMode: 'screen'}} />
      <div style={{position: 'absolute', inset: 0, boxShadow: `inset 0 0 ${140 + pulse * 80}px rgba(0,0,0,0.88)`}} />
    </AbsoluteFill>
  );
};

// —— 主书氛围页 ————————————————————————————————————————————————————

/** 生成式主书背景（渐变 + 书脊剪影 + 暗角），作为自定义背景的降级。 */
const GeneratedMainBackground: React.FC<{palette: MainBookData['palette']}> = ({palette}) => (
  <>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(160deg, ${palette[1]}, ${palette[0]} 64%, ${palette[2]}), radial-gradient(circle at 50% 22%, rgba(255,255,255,0.55), transparent 28%)`,
        filter: 'contrast(1.07) saturate(0.92)',
      }}
    />
    {Array.from({length: 18}, (_, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: 30 + (i % 6) * 112,
          top: 278 + Math.floor(i / 6) * 118,
          width: 24,
          height: 122,
          background: 'rgba(32,24,16,0.74)',
          transform: `rotate(${58 - (i % 3) * 7}deg)`,
          boxShadow: '40px 44px 26px rgba(0,0,0,0.18)',
        }}
      />
    ))}
  </>
);

const MainBookScene: React.FC<{mainBook: MainBookData; start: number}> = ({mainBook, start}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - start);
  const enter = interpolate(frame, [start, start + 8], [0.96, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const drift = interpolate(local, [0, 80], [0, -30], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hasCover = Boolean(mainBook.coverPath);

  return (
    <AbsoluteFill style={{opacity: enter, background: mainBook.palette[1], overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: -80,
          transform: `translateY(${drift}px) scale(${1.04 + local * 0.0008})`,
        }}
      >
        {/* 自定义背景优先，缺失时降级到生成式背景。 */}
        <CoverImage
          src={mainBook.backgroundPath}
          fallback={<GeneratedMainBackground palette={mainBook.palette} />}
        />
      </div>
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.76), transparent 48%, rgba(0,0,0,0.22))'}} />

      {/* 主封面：仅在配置了封面时显示，加载失败降级为图形封面，不会留下空框。 */}
      {hasCover ? (
        <div
          style={{
            position: 'absolute',
            top: 232,
            left: 210,
            width: 300,
            height: 440,
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            transform: `translateY(${(1 - enter) * 12}px)`,
          }}
        >
          <CoverImage
            src={mainBook.coverPath}
            fallback={
              <GeneratedCover
                card={{title: mainBook.title, author: mainBook.author, coverPath: null, palette: mainBook.palette, motif: 'portrait'}}
              />
            }
          />
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          top: hasCover ? 118 : 110,
          left: 56,
          right: 56,
          textAlign: 'center',
          color: 'white',
          fontSize: 44,
          fontWeight: 850,
          textShadow: '0 4px 20px rgba(0,0,0,0.68)',
        }}
      >
        《{mainBook.title}》
      </div>
      {mainBook.author ? (
        <div
          style={{
            position: 'absolute',
            top: hasCover ? 178 : 170,
            left: 80,
            right: 80,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.82)',
            fontSize: 20,
            fontWeight: 650,
          }}
        >
          {mainBook.author}
        </div>
      ) : null}
      {mainBook.zhLine || mainBook.enLine ? (
        <div
          style={{
            position: 'absolute',
            left: 58,
            right: 58,
            bottom: 252,
            textAlign: 'center',
            transform: `translateY(${(1 - enter) * 16}px)`,
          }}
        >
          {mainBook.zhLine ? (
            <div style={{color: '#ffe25d', fontSize: 29, lineHeight: 1.28, fontWeight: 850, textShadow: '0 3px 16px rgba(0,0,0,0.74)'}}>
              {mainBook.zhLine}
            </div>
          ) : null}
          {mainBook.enLine ? (
            <div style={{marginTop: 10, color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 1.3, fontWeight: 600}}>
              {mainBook.enLine}
            </div>
          ) : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// —— 组合 ——————————————————————————————————————————————————————————

export const BookIntroVideo: React.FC<BookIntroProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cuts = props.flashCutFrames;
  const hasCuts = cuts.length > 0;
  const flashStart = hasCuts ? cuts[0] : Number.POSITIVE_INFINITY;
  const mainStart = hasCuts ? cuts[cuts.length - 1] : Number.POSITIVE_INFINITY;

  return (
    <AbsoluteFill style={{background: 'black', fontFamily: 'Microsoft YaHei, SimHei, Arial, sans-serif'}}>
      <Audio src={staticFile('sample-beat.wav')} />

      {frame < flashStart ? <IntroLayer intro={props.intro} /> : null}
      {hasCuts && frame >= flashStart - 4 && frame < mainStart ? (
        <BookFlashSequence cuts={cuts} bookCards={props.bookCards} />
      ) : null}
      {hasCuts && frame >= mainStart ? <MainBookScene mainBook={props.mainBook} start={mainStart} /> : null}

      {props.intro.showSubtitles ? <SubtitleTrack tracks={props.subtitleTracks} /> : null}

      <div style={{position: 'absolute', top: 24, right: 24, color: 'rgba(255,255,255,0.42)', fontSize: 13}}>
        {(frame / fps).toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
