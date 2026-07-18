import {Composition} from 'remotion';
import {BookIntroVideo} from './BookIntro';
import {BookIntroFromConfig, calcConfigMetadata} from './BookIntroFromConfig';
import {durationForProps, loadConfigProps, rawExampleConfig, sampleProps} from './config';

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

export const RemotionRoot = () => {
  const configProps = loadConfigProps();

  return (
    <>
      {/* 阶段一默认样片：纯生成式封面，保留原有能力。 */}
      <Composition
        id="BookIntro"
        component={BookIntroVideo}
        durationInFrames={durationForProps(sampleProps)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={sampleProps}
      />

      {/* 阶段二配置驱动：props 已由 config/*.example.json 构建。 */}
      <Composition
        id="BookIntroConfig"
        component={BookIntroVideo}
        durationInFrames={durationForProps(configProps)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={configProps}
      />

      {/* 阶段三批量入口：接收原始三件套 props，时长按 props 动态推算。 */}
      <Composition
        id="BookIntroFromConfig"
        component={BookIntroFromConfig}
        durationInFrames={240}
        calculateMetadata={calcConfigMetadata}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={rawExampleConfig}
      />
    </>
  );
};
