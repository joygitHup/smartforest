// Scene03Position 产品定位 — 4 步业务闭环
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const STEPS = [
  { t: '监测', d: '物联设备 7×24 遥测',  c: COLORS.green },
  { t: '研判', d: '规则引擎分级预警',  c: COLORS.blue  },
  { t: '处置', d: '工单派单闭环跟踪',  c: COLORS.amber },
  { t: '复盘', d: '过程留痕考核沉淀',  c: COLORS.cyan  },
];

const VALS = [
  { t: '全域感知', d: '双光谱云台、环境站、网关、无人机统一接入', c: COLORS.green },
  { t: '分级预警', d: '可配置规则 + 告警冷却，不漏报也不打扰',  c: COLORS.blue  },
  { t: '一图指挥', d: 'GIS 态势一张图集中呈现设备与告警',       c: COLORS.amber },
];

export const Scene03Position: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const steps = useStagger(STEPS, 100, 16);
  const vals  = useStagger(VALS,  180, 18);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.blue}/>
      {/* 顶部 */}
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.blue, fontWeight: 600, letterSpacing: 3 }}>
        02 · POSITIONING
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, ...useFadeUp(16),
        fontFamily: FONT_ZH, fontSize: 80, color: COLORS.txt, fontWeight: 700 }}>一体化数字指挥平台</div>
      <div style={{ position: 'absolute', left: 140, top: 280, width: 1500, ...useFadeUp(28),
        fontFamily: FONT_ZH, fontSize: 28, color: COLORS.sub, lineHeight: 1.5 }}>
        汇聚物联感知、规则预警、GIS 态势与工单闭环，支撑「监测—研判—处置—复盘」完整业务闭环
      </div>

      {/* Hero 卡 */}
      <div style={{ position: 'absolute', left: 130, top: 370, width: 1670, height: 180, ...useFadeUp(50),
        background: `linear-gradient(180deg, ${COLORS.cardTop} 0%, ${COLORS.cardBot} 100%)`,
        border: `1px solid ${COLORS.border}`, borderRadius: 14, display: 'flex', alignItems: 'center', padding: '0 48px',
        overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: COLORS.blue,
          boxShadow: `0 0 22px ${COLORS.blue}99` }}/>
        <div>
          <div style={{ fontFamily: FONT_ZH, fontSize: 48, color: COLORS.txt, fontWeight: 700, marginBottom: 14 }}>
            把万亩林区，装进一张实时更新的指挥地图
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 20, color: COLORS.sub }}>
            LinZhi Forest Intelligent Monitoring Platform — 森林防火与林区运行监测的数字化底座
          </div>
        </div>
      </div>

      {/* 业务闭环 4 步骤 */}
      <div style={{ position: 'absolute', left: 130, top: 600, width: 1670, ...useFadeUp(80) }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: COLORS.blue, fontWeight: 600, marginBottom: 24, letterSpacing: 3 }}>
          业务闭环 · CLOSED-LOOP WORKFLOW
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 24 }}>
          {steps.map(({ it, op, ty }, i) => (
            <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${ty}px)`,
              background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12,
              padding: '30px 32px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: it.c, marginBottom: 18,
                boxShadow: `0 0 16px ${it.c}AA` }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 40, color: COLORS.txt, fontWeight: 700, marginBottom: 8 }}>{it.t}</div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 22, color: COLORS.sub }}>{it.d}</div>
              {i < 3 && <div style={{ position: 'absolute', right: -14, top: '50%', marginTop: -14,
                width: 28, height: 28, borderRadius: 4, background: COLORS.border, opacity: 0.7 }}/>}
            </div>
          ))}
        </div>
      </div>

      {/* 3 价值主张 */}
      <div style={{ position: 'absolute', left: 130, top: 850, width: 1670, display: 'flex', gap: 24 }}>
        {vals.map(({ it, op, ty }, i) => (
          <div key={i} style={{ flex: 1, opacity: op, transform: `translateY(${ty}px)`,
            position: 'relative', borderRadius: 12, padding: '24px 28px',
            background: COLORS.card2, border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: it.c,
              boxShadow: `0 0 18px ${it.c}99` }}/>
            <div style={{ fontFamily: FONT_ZH, fontSize: 32, color: it.c, fontWeight: 700, marginBottom: 10 }}>{it.t}</div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 20, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
