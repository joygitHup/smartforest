import React from 'react';
import { Composition } from 'remotion';
import { Video } from './compositions/linzhi-product/Video';
import { TOTAL, TIMING } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="LinZhiProduct"
      component={Video}
      durationInFrames={TOTAL}
      fps={TIMING.fps}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
  </>
);
