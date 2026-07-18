// 书籍开场模板主组件。
//
// 阶段二：模板由统一 `BookIntroProps` 驱动，能力拆成 IntroLayer / BookFlashSequence /
// MainBookScene / SubtitleTrack 独立组件。
// 阶段三：引入模板库（templates.ts）。同一组件按 `props.template` 选取一组视觉令牌
// （字体、配色、圆角、背景风格、卡片样式、暗角），渲染出可辨识的不同风格。
//
// 所有动画都用 `useCurrentFrame()` + `interpolate()` + 显式帧号驱动。

import React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {IntroLayer} from './components/IntroLayer';
import {SubtitleTrack} from './components/SubtitleTrack';
import {CoverImage} from './components/CoverImage';
import {getTemplate} from './templates';
import type {MainBackgroundStyle, TemplateTokens} from './templates';
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

/** 参数化生成的书封（gradient + 图形 + 书名），cover 风格模板的降级。 */
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
        <div style={{position: 'absolute', top: 128, left: 40, right: 40, color: 'rgba(255,255,255,0.86)', textAlign: 'center', fontSize: 20, fontWeight: 700}}>
          {card.author}
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 44, right: 44, bottom: 58, height: 2, background: 'rgba(255,255,255,0.58)'}} />
    </div>
  );
};

/** 金句风格卡片（纸底 + 深色大字），quote 模板的降级封面。 */
const QuoteCover: React.FC<{title: string; author?: string}> = ({title, author}) => (
  <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #f6efe1, #e7dcc4)'}}>
    <div style={{position: 'absolute', left: 34, right: 34, top: 40, height: 3, background: '#c8b58f'}} />
    <div style={{position: 'absolute', left: 34, right: 34, bottom: 40, height: 3, background: '#c8b58f'}} />
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px'}}>
      <div style={{color: '#2b2016', textAlign: 'center', fontSize: 42, lineHeight: 1.25, fontWeight: 800}}>《{title}》</div>
      {author ? <div style={{marginTop: 16, color: 'rgba(43,32,22,0.68)', fontSize: 20, fontWeight: 600}}>{author}</div> : null}
    </div>
  </div>
);

const FallbackCover: React.FC<{card: BookCoverCardData; tokens: TemplateTokens}> = ({card, tokens}) =>
  tokens.cardStyle === 'quote' ? <QuoteCover title={card.title} author={card.author} /> : <GeneratedCover card={card} />;

const BookCoverCard: React.FC<{card: BookCoverCardData; pulse: number; tokens: TemplateTokens}> = ({card, pulse, tokens}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: 100,
        top: 170,
        width: 520,
        height: 770,
        borderRadius: tokens.cardRadius,
        overflow: 'hidden',
        background: '#050505',
        boxShadow: `0 ${36 + pulse * 12}px ${70 + pulse * 30}px rgba(0,0,0,0.48)`,
        transform: `scale(${1 + pulse * 0.035})`,
      }}
    >
      {/* 真实封面优先，加载失败降级到模板对应的图形/金句封面。 */}
      <CoverImage src={card.coverPath} fallback={<FallbackCover card={card} tokens={tokens} />} />
    </div>
  );
};

const BookFlashSequence: React.FC<{cuts: number[]; bookCards: BookCoverCardData[]; tokens: TemplateTokens}> = ({cuts, bookCards, tokens}) => {
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
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 42%, ${card.palette[0]}55, transparent 45%), #050505`}} />
      <BookCoverCard card={card} pulse={pulse} tokens={tokens} />
      <div style={{position: 'absolute', inset: 0, opacity: pulse * 0.32, background: 'white', mixBlendMode: 'screen'}} />
      <div style={{position: 'absolute', inset: 0, boxShadow: `inset 0 0 ${140 + pulse * 80}px rgba(0,0,0,0.88)`}} />
    </AbsoluteFill>
  );
};

// —— 主书氛围页背景（模板风格变体）——————————————————————————————————

const SpinesBackground: React.FC<{palette: MainBookData['palette']}> = ({palette}) => (
  <>
    <div style={{position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${palette[1]}, ${palette[0]} 64%, ${palette[2]}), radial-gradient(circle at 50% 22%, rgba(255,255,255,0.55), transparent 28%)`, filter: 'contrast(1.07) saturate(0.92)'}} />
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

const WarmBackground: React.FC = () => (
  <>
    <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 30%, #ffd9a8, #e8956b 52%, #7d4a3a)'}} />
    <div style={{position: 'absolute', left: 120, top: 180, width: 480, height: 480, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent 62%)', filter: 'blur(4px)'}} />
  </>
);

const PaperBackground: React.FC = () => (
  <>
    <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #efe6d4, #e2d5bd)'}} />
    {Array.from({length: 22}, (_, i) => (
      <div key={i} style={{position: 'absolute', left: 60, right: 60, top: 150 + i * 46, height: 1, background: 'rgba(120,100,70,0.18)'}} />
    ))}
  </>
);

const ContrastBackground: React.FC<{palette: MainBookData['palette']}> = ({palette}) => (
  <>
    <div style={{position: 'absolute', inset: 0, background: '#0a0909'}} />
    <div style={{position: 'absolute', inset: 0, background: `linear-gradient(118deg, transparent 0 40%, ${palette[0]} 41% 46%, transparent 47%), linear-gradient(118deg, transparent 0 58%, #ff3b3b 59% 61%, transparent 62%)`, opacity: 0.85}} />
    {Array.from({length: 5}, (_, i) => (
      <div key={i} style={{position: 'absolute', left: -60, right: -60, top: 120 + i * 210, height: 3, background: 'rgba(255,59,59,0.5)', transform: 'rotate(-28deg)'}} />
    ))}
  </>
);

const MainBackground: React.FC<{style: MainBackgroundStyle; palette: MainBookData['palette']}> = ({style, palette}) => {
  if (style === 'warm') return <WarmBackground />;
  if (style === 'paper') return <PaperBackground />;
  if (style === 'contrast') return <ContrastBackground palette={palette} />;
  return <SpinesBackground palette={palette} />;
};

const MainBookScene: React.FC<{mainBook: MainBookData; start: number; tokens: TemplateTokens}> = ({mainBook, start, tokens}) => {
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
  const v = tokens.vignette;

  return (
    <AbsoluteFill style={{opacity: enter, background: mainBook.palette[1], overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: -80, transform: `translateY(${drift}px) scale(${1.04 + local * 0.0008})`}}>
        {/* 自定义背景优先，缺失时降级到模板风格背景。 */}
        <CoverImage src={mainBook.backgroundPath} fallback={<MainBackground style={tokens.mainBackground} palette={mainBook.palette} />} />
      </div>
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(0deg, rgba(0,0,0,${v}), transparent 48%, rgba(0,0,0,${v * 0.3}))`}} />

      {hasCover ? (
        <div
          style={{
            position: 'absolute',
            top: 232,
            left: 210,
            width: 300,
            height: 440,
            borderRadius: tokens.cardRadius,
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            transform: `translateY(${(1 - enter) * 12}px)`,
          }}
        >
          <CoverImage
            src={mainBook.coverPath}
            fallback={<FallbackCover card={{title: mainBook.title, author: mainBook.author, coverPath: null, palette: mainBook.palette, motif: 'portrait'}} tokens={tokens} />}
          />
        </div>
      ) : null}

      <div style={{position: 'absolute', top: hasCover ? 118 : 110, left: 56, right: 56, textAlign: 'center', color: tokens.mainTextColor, fontSize: 44, fontWeight: 850, textShadow: '0 4px 20px rgba(0,0,0,0.5)'}}>
        《{mainBook.title}》
      </div>
      {mainBook.author ? (
        <div style={{position: 'absolute', top: hasCover ? 178 : 170, left: 80, right: 80, textAlign: 'center', color: tokens.mainSubColor, fontSize: 20, fontWeight: 650}}>
          {mainBook.author}
        </div>
      ) : null}
      {mainBook.zhLine || mainBook.enLine ? (
        <div style={{position: 'absolute', left: 58, right: 58, bottom: 252, textAlign: 'center', transform: `translateY(${(1 - enter) * 16}px)`}}>
          {mainBook.zhLine ? (
            <div style={{color: tokens.mainQuoteColor, fontSize: 29, lineHeight: 1.28, fontWeight: 850, textShadow: '0 3px 16px rgba(0,0,0,0.4)'}}>
              {mainBook.zhLine}
            </div>
          ) : null}
          {mainBook.enLine ? (
            <div style={{marginTop: 10, color: tokens.mainSubColor, fontSize: 15, lineHeight: 1.3, fontWeight: 600}}>{mainBook.enLine}</div>
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
  const tokens = getTemplate(props.template);
  const cuts = props.flashCutFrames;
  const hasCuts = cuts.length > 0;
  const flashStart = hasCuts ? cuts[0] : Number.POSITIVE_INFINITY;
  const mainStart = hasCuts ? cuts[cuts.length - 1] : Number.POSITIVE_INFINITY;

  return (
    <AbsoluteFill style={{background: 'black', fontFamily: tokens.fontFamily}}>
      <Audio src={staticFile('sample-beat.wav')} />

      {frame < flashStart ? <IntroLayer intro={props.intro} /> : null}
      {hasCuts && frame >= flashStart - 4 && frame < mainStart ? (
        <BookFlashSequence cuts={cuts} bookCards={props.bookCards} tokens={tokens} />
      ) : null}
      {hasCuts && frame >= mainStart ? <MainBookScene mainBook={props.mainBook} start={mainStart} tokens={tokens} /> : null}

      {props.intro.showSubtitles ? <SubtitleTrack tracks={props.subtitleTracks} /> : null}

      <div style={{position: 'absolute', top: 24, right: 24, color: 'rgba(255,255,255,0.42)', fontSize: 13}}>
        {(frame / fps).toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
