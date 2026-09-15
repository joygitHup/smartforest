import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { COLORS, SCENES, CUM_FRAMES, TOTAL } from '../../theme';
import { Scene01Cover } from './Scene01Cover';
import { Scene02Pains } from './Scene02Pains';
import { Scene03Position } from './Scene03Position';
import { Scene04Arch } from './Scene04Arch';
import { Scene05OpsConsole } from './Scene05OpsConsole';
import { Scene06Devices } from './Scene06Devices';
import { Scene07Alert } from './Scene07Alert';
import { Scene08FireInvest } from './Scene08FireInvest';
import { Scene09Tech } from './Scene09Tech';
import { Scene10Scenarios } from './Scene10Scenarios';
import { Scene11Deploy } from './Scene11Deploy';
import { Scene12Outro } from './Scene12Outro';

const VOICE_FILES = [
  '',   // index 0 占位
  'voice/scene_01.mp3',
  'voice/scene_02.mp3',
  'voice/scene_03.mp3',
  'voice/scene_04.mp3',
  'voice/scene_05.mp3',
  'voice/scene_06.mp3',
  'voice/scene_07.mp3',
  'voice/scene_08.mp3',
  'voice/scene_09.mp3',
  'voice/scene_10.mp3',
  'voice/scene_11.mp3',
  'voice/scene_12.mp3',
];

const RENDERERS: Record<number, React.FC<any>> = {
  1: Scene01Cover, 2: Scene02Pains, 3: Scene03Position, 4: Scene04Arch,
  5: Scene05OpsConsole, 6: Scene06Devices, 7: Scene07Alert, 8: Scene08FireInvest,
  9: Scene09Tech, 10: Scene10Scenarios, 11: Scene11Deploy, 12: Scene12Outro,
};

export const Video: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bgBot }}>
      {/* BGM 一直铺底 — XPR, 100s, 音量低 */}
      <Audio src={staticFile('sunbyrn_-_XPR.mp3')} volume={(v) => Math.min(0.32, v * 1.2)} />
      {/* 12 个场景 Sequence */}
      {CUM_FRAMES.map((c, i) => {
        const Comp = RENDERERS[c.n];
        const dur = c.to - c.from;
        return (
          <Sequence key={c.n} from={c.from} durationInFrames={dur}>
            <AbsoluteFill>
              <Comp durationInFrames={dur} sceneNum={c.n} />
              {/* 本段配音 */}
              <Audio src={staticFile(VOICE_FILES[c.n])} volume={1} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
