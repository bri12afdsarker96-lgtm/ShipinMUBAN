import {Composition} from 'remotion';
import {BookIntroVideo} from './BookIntro';
import {samplePreset} from './preset';

export const RemotionRoot = () => {
  return (
    <Composition
      id="BookIntro"
      component={BookIntroVideo}
      durationInFrames={240}
      fps={30}
      width={720}
      height={1280}
      defaultProps={samplePreset}
    />
  );
};
