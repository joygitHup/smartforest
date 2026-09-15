// Scene07Alert 智能预警 — 规则引擎 + 告警闭环
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const RULES = [
  { t: '多维规则配置', d: '告警类型、级别、阈值、作用范围灵活组合' },
  { t: '双形态规则',   d: '系统默认规则开箱即用，组织自建按需扩展' },
  { t: '异步评估',     d: '规则评估与遥测入库解耦，不阻塞采集主路径' },
  { t: '告警冷却',     d: '同类规则触发冷却期，抑制告警风暴'       },
];
const FLOW = [
  { t: '告警产生', d: '规则命中自动生成',     c: COLORS.red   },
  { t: '值班确认', d: '站内信 + 值班联动触达', c: COLORS.amber },
  { t: '派单处置', d: '转化为可跟踪工单',     c: COLORS.blue  },
  { t: '办结归档', d: '办结 / 误报状态流转',  c: COLORS.green },
];

export const Scene07Alert: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const rules = useStagger(RULES, 30, 12);
  const flow  = useStagger(FLOW,  40, 14);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.amber}/>
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.amber, fontWeight: 600, letterSpacing: 3 }}>
        04 · CORE FEATURES
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, ...useFadeUp(14),
        fontFamily: FONT_ZH, fontSize: 66, color: COLORS.txt, fontWeight: 700 }}>智能预警 — 规则引擎与告警闭环</div>
      <div style={{ position: 'absolute', left: 140, top: 264, width: 1500, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 24, color: COLORS.sub }}>可配置规则 + 工单流转 + 值班联动，让每一条告警都被处置、被记录</div>

      {/* 左: 规则引擎 */}
      <div style={{ position: 'absolute', left: 130, top: 360, width: 800, height: 600,
        background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12, padding: '32px 40px',
        overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: COLORS.amber, boxShadow: `0 0 22px ${COLORS.amber}AA` }}/>
        <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: COLORS.amber, fontWeight: 700, marginBottom: 28, letterSpacing: 3 }}>RULE ENGINE · 规则引擎</div>
        {rules.map(({ it, op, ty }, i) => (
          <div key={i} style={{ opacity: op, transform: `translateY(${ty}px)`, marginBottom: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <div style={{ width: 14, height: 14, background: COLORS.amber }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 28, color: COLORS.txt, fontWeight: 700 }}>{it.t}</div>
            </div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 20, color: COLORS.sub, paddingLeft: 30, lineHeight: 1.45 }}>{it.d}</div>
          </div>
        ))}
      </div>

      {/* 右: 告警闭环 */}
      <div style={{ position: 'absolute', right: 130, top: 360, width: 800, height: 600,
        background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12, padding: '32px 40px',
        overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: COLORS.green, boxShadow: `0 0 22px ${COLORS.green}AA` }}/>
        <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: COLORS.green, fontWeight: 700, marginBottom: 28, letterSpacing: 3 }}>ALERT CLOSED-LOOP · 告警闭环</div>
        {flow.map(({ it, op, ty }, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 24, opacity: op, transform: `translateY(${ty}px)` }}>
            <div style={{ width: 62, height: 62, borderRadius: '50%', background: it.c, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontFamily: FONT_MONO, fontSize: 32,
              color: '#fff', fontWeight: 700, flexShrink: 0, boxShadow: `0 0 22px ${it.c}AA` }}>{i+1}</div>
            <div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700, marginBottom: 6 }}>{it.t}</div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 20, color: COLORS.sub }}>{it.d}</div>
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
