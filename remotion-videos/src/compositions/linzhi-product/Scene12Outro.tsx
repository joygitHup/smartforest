// Scene12Outro 封底 — 雷达辉光 + 品牌语 + 联系胶囊
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, RadarDots, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const ACTIONS = [
  { t: '产品咨询', sub: 'PRESALES', c: COLORS.blue  },
  { t: '方案演示', sub: 'DEMO',     c: COLORS.green },
  { t: '试点合作', sub: 'PILOT',    c: COLORS.amber },
];

export const Scene12Outro: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.cyan}/>

      {/* 中央雷达装饰 */}
      <RadarDots cx={960} cy={430} size={90} color={COLORS.cyan} pulse/>

      {/* 主标语 */}
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, ...useFadeUp(10),
        textAlign: 'center', fontFamily: FONT_MONO, fontSize: 24, color: COLORS.cyan,
        fontWeight: 700, letterSpacing: 6 }}>SMART FOREST · SAFER FUTURE</div>
      <div style={{ position: 'absolute', top: 208, left: 0, right: 0, ...useFadeUp(22),
        textAlign: 'center', fontFamily: FONT_ZH, fontSize: 84, color: COLORS.txt, fontWeight: 700 }}>
        守护绿水青山<span style={{ color: COLORS.green }}>，</span>从每一亩感知开始
      </div>
      {/* 标题下发光分隔线 */}
      <div style={{
        position: 'absolute', top: 352, left: '50%', marginLeft: -210, width: 420, height: 3,
        background: 'linear-gradient(90deg, #06B6D4, #10B981)', borderRadius: 2,
        boxShadow: '0 0 18px #06B6D488', ...useFadeUp(30),
      }}/>
      <div style={{ position: 'absolute', top: 386, left: 0, right: 0, ...useFadeUp(40),
        textAlign: 'center', fontFamily: FONT_ZH, fontSize: 27, color: COLORS.sub }}>
        林智森林智能监控平台 —— 让森林防火从被动响应，走向主动防控
      </div>

      {/* 品牌 */}
      <div style={{ position: 'absolute', top: 470, left: 0, right: 0, ...useFadeUp(56),
        textAlign: 'center', fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700 }}>
        林智 LINZHI · 森林智能监控平台 V1.0
      </div>
      <div style={{ position: 'absolute', top: 522, left: 0, right: 0, ...useFadeUp(66),
        textAlign: 'center', fontFamily: FONT_MONO, fontSize: 16, color: COLORS.sub, letterSpacing: 2 }}>
        SMART FOREST MONITORING PLATFORM · 2026
      </div>

      {/* 联系胶囊 */}
      <div style={{ position: 'absolute', top: 600, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 46, ...useFadeUp(80) }}>
        {ACTIONS.map((a, i) => (
          <div key={i} style={{
            width: 250, height: 128,
            background: `linear-gradient(180deg, ${COLORS.cardTop} 0%, ${COLORS.cardBot} 100%)`,
            border: `1px solid ${COLORS.border2}`, borderRadius: 64,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden', boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: a.c, boxShadow: `0 0 18px ${a.c}99` }}/>
            <div style={{ fontFamily: FONT_ZH, fontSize: 27, color: COLORS.txt, fontWeight: 700 }}>{a.t}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: a.c, fontWeight: 700, letterSpacing: 3, marginTop: 6 }}>{a.sub}</div>
          </div>
        ))}
      </div>

      {/* 版权 */}
      <div style={{ position: 'absolute', bottom: 42, left: 0, right: 0, ...useFadeUp(110),
        textAlign: 'center', fontFamily: FONT_ZH, fontSize: 18, color: COLORS.sub, opacity: 0.75 }}>
        让每一条告警被看见 · 让每一次处置有依据
      </div>
    </AbsoluteFill>
  );
};
