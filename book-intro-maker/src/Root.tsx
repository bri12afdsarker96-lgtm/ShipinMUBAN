import {Composition} from 'remotion';
import {BookIntroVideo} from './BookIntro';
import {loadConfigProps, sampleProps} from './config';
import type {BookIntroProps} from './config';

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

/** 根据快闪切点推算合适时长：主书页至少留 45 帧尾巴，最少 240 帧。 */
const durationFor = (props: BookIntroProps): number => {
  const lastCut = props.flashCutFrames[props.flashCutFrames.length - 1] ?? 0;
  const lastSubtitle = props.subtitleTracks.reduce((max, t) => Math.max(max, t.endFrame), 0);
  return Math.max(240, lastCut + 45, lastSubtitle + 15);
};

export const RemotionRoot = () => {
  const configProps = loadConfigProps();

  return (
    <>
      {/* 阶段一默认样片：纯生成式封面，保留原有能力。 */}
      <Composition
        id="BookIntro"
        component={BookIntroVideo}
        durationInFrames={durationFor(sampleProps)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={sampleProps}
      />

      {/* 阶段二配置驱动：由 config/*.example.json 生成。 */}
      <Composition
        id="BookIntroConfig"
        component={BookIntroVideo}
        durationInFrames={durationFor(configProps)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={configProps}
      />
    </>
  );
};
