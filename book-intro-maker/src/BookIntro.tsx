import React from 'react';
import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {BookCard, BookIntroPreset, HookLine} from './preset';

const WIDTH = 720;
const HEIGHT = 1280;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const cutDistance = (frame: number, cuts: number[]) => {
  return Math.min(...cuts.map((cut) => Math.abs(frame - cut)));
};

const pulseForCuts = (frame: number, cuts: number[]) => {
  const distance = cutDistance(frame, cuts);
  return clamp(1 - distance / 4, 0, 1);
};

const activeIndexFromCuts = (frame: number, cuts: number[]) => {
  let index = 0;
  for (let i = 0; i < cuts.length; i++) {
    if (frame >= cuts[i]) {
      index = i;
    }
  }
  return index;
};

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

const HookCaption: React.FC<{line: HookLine}> = ({line}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [line.startFrame, line.startFrame + 6], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(frame, [line.endFrame - 6, line.endFrame], [1, 0], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        bottom: 318,
        textAlign: 'center',
        opacity: enter * exit,
        transform: `translateY(${(1 - enter) * 16}px)`,
      }}
    >
      <div
        style={{
          color: '#ffe15a',
          fontSize: 34,
          lineHeight: 1.18,
          fontWeight: 800,
          textShadow: '0 2px 12px rgba(0,0,0,0.75)',
        }}
      >
        {line.zh}
      </div>
      <div
        style={{
          marginTop: 8,
          color: 'rgba(255,255,255,0.92)',
          fontSize: 16,
          lineHeight: 1.25,
          fontWeight: 600,
          textShadow: '0 2px 10px rgba(0,0,0,0.65)',
        }}
      >
        {line.en}
      </div>
    </div>
  );
};

const HookScene: React.FC<{lines: HookLine[]}> = ({lines}) => {
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
      <SnowField />
      {lines.map((line) => (
        <HookCaption key={line.zh} line={line} />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 70,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 16,
          letterSpacing: 0,
        }}
      >
        @BookIntroMaker
      </div>
    </AbsoluteFill>
  );
};

const CoverMotif: React.FC<{card: BookCard}> = ({card}) => {
  const [a, b, c] = card.palette;
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

const BookCoverCard: React.FC<{card: BookCard; pulse: number}> = ({card, pulse}) => {
  const [a, b, c] = card.palette;
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
        background: `linear-gradient(145deg, ${a}, ${c})`,
        boxShadow: `0 ${36 + pulse * 12}px ${70 + pulse * 30}px rgba(0,0,0,0.48)`,
        transform: `scale(${1 + pulse * 0.035})`,
      }}
    >
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
      <div
        style={{
          position: 'absolute',
          left: 44,
          right: 44,
          bottom: 58,
          height: 2,
          background: 'rgba(255,255,255,0.58)',
        }}
      />
    </div>
  );
};

const BookFlashSequence: React.FC<{preset: BookIntroPreset}> = ({preset}) => {
  const frame = useCurrentFrame();
  const active = activeIndexFromCuts(frame, preset.flashCutFrames);
  const coverIndex = clamp(active, 0, preset.bookCards.length - 1);
  const pulse = pulseForCuts(frame, preset.flashCutFrames);
  const card = preset.bookCards[coverIndex];
  const fade = interpolate(frame, [preset.flashCutFrames[0] - 4, preset.flashCutFrames[0]], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: pulse * 0.32,
          background: 'white',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: `inset 0 0 ${140 + pulse * 80}px rgba(0,0,0,0.88)`,
        }}
      />
    </AbsoluteFill>
  );
};

const MainBookScene: React.FC<{preset: BookIntroPreset}> = ({preset}) => {
  const frame = useCurrentFrame();
  const {mainBook} = preset;
  const start = preset.flashCutFrames[preset.flashCutFrames.length - 1];
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

  return (
    <AbsoluteFill style={{opacity: enter, background: mainBook.palette[1], overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: -80,
          transform: `translateY(${drift}px) scale(${1.04 + local * 0.0008})`,
          background: `linear-gradient(160deg, ${mainBook.palette[1]}, ${mainBook.palette[0]} 64%, ${mainBook.palette[2]}), radial-gradient(circle at 50% 22%, rgba(255,255,255,0.55), transparent 28%)`,
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
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.76), transparent 48%, rgba(0,0,0,0.22))'}} />
      <div
        style={{
          position: 'absolute',
          top: 110,
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
      <div
        style={{
          position: 'absolute',
          top: 170,
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
        <div style={{color: '#ffe25d', fontSize: 29, lineHeight: 1.28, fontWeight: 850, textShadow: '0 3px 16px rgba(0,0,0,0.74)'}}>
          {mainBook.zhLine}
        </div>
        <div style={{marginTop: 10, color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 1.3, fontWeight: 600}}>
          {mainBook.enLine}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BookIntroVideo: React.FC<BookIntroPreset> = (preset) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const mainStart = preset.flashCutFrames[preset.flashCutFrames.length - 1];

  return (
    <AbsoluteFill style={{background: 'black', fontFamily: 'Microsoft YaHei, SimHei, Arial, sans-serif'}}>
      <Audio src={staticFile('sample-beat.wav')} />
      {frame < preset.flashCutFrames[0] && <HookScene lines={preset.hookLines} />}
      {frame >= preset.flashCutFrames[0] - 4 && frame < mainStart && <BookFlashSequence preset={preset} />}
      {frame >= mainStart && <MainBookScene preset={preset} />}
      <div
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          color: 'rgba(255,255,255,0.42)',
          fontSize: 13,
        }}
      >
        {(frame / fps).toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
