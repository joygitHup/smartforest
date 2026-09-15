// Scene05OpsConsole 指挥中心 — 4 指标 + 4 GIS 特性
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const METRICS = [
  { v: '12,860', lbl: '设备总数',     en: 'ALL DEVICES',    c: COLORS.blue  },
  { v: '99.2%',   lbl: '在线率',       en: 'ONLINE RATE',    c: COLORS.green },
  { v: '03',      lbl: '未处理告警',   en: 'PENDING ALERTS', c: COLORS.amber },
  { v: '01',      lbl: '火情事件',     en: 'FIRE EVENTS',    c: COLORS.red   },
];
const FEATS = [
  { t: '实时点位渲染', d: '设备与告警分布实时呈现，缩小地图点位仍可辨识', c: COLORS.green },
  { t: '图层与过滤',   d: '支持图层切换、按林区过滤，多维度聚焦重点区域', c: COLORS.blue  },
  { t: '秒级刷新',     d: 'WebSocket 推送设备状态与告警，大屏实时联动', c: COLORS.cyan  },
  { t: '一键下钻',     d: '悬停查看设备摘要，点击进入详情或下发指令',   c: COLORS.amber },
];

export const Scene05OpsConsole: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const met = useStagger(METRICS, 30, 14);
  const feat = useStagger(FEATS, 30, 14);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.green}/>
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.green, fontWeight: 600, letterSpacing: 3 }}>
        04 · CORE FEATURES
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, ...useFadeUp(14),
        fontFamily: FONT_ZH, fontSize: 72, color: COLORS.txt, fontWeight: 700 }}>指挥中心 — 态势一张图</div>
      <div style={{ position: 'absolute', left: 140, top: 270, width: 1500, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 26, color: COLORS.sub }}>关键运行指标 + GIS 实时态势，值班指挥的核心驾驶舱</div>

      {/* 左: 4 指标 */}
      <div style={{ position: 'absolute', left: 130, top: 370, width: 720 }}>
        <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700, marginBottom: 24 }}>运行指标总览</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {met.map(({ it, op, ty }, i) => (
            <div key={i} style={{ position: 'relative', opacity: op, transform: `translateY(${ty}px)`,
              background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12,
              padding: '22px 24px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: it.c,
                boxShadow: `0 0 18px ${it.c}AA` }}/>
              <div style={{ fontFamily: FONT_MONO, fontSize: 16, color: it.c, marginBottom: 10, letterSpacing: 2 }}>{it.en}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 56, color: COLORS.txt, fontWeight: 700, lineHeight: 1 }}>{it.v}</div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 22, color: COLORS.sub, marginTop: 8 }}>{it.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右: GIS 特性 */}
      <div style={{ position: 'absolute', right: 130, top: 370, width: 870, height: 650,
        background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12, padding: '34px 40px',
        overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: COLORS.green, boxShadow: `0 0 22px ${COLORS.green}AA` }}/>
        <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.green, fontWeight: 700, marginBottom: 24 }}>GIS 实时态势</div>
        {feat.map(({ it, op, ty }, i) => (
          <div key={i} style={{ opacity: op, transform: `translateY(${ty}px)`, marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: it.c, boxShadow: `0 0 14px ${it.c}AA` }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 28, color: COLORS.txt, fontWeight: 700 }}>{it.t}</div>
            </div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 21, color: COLORS.sub, paddingLeft: 32, lineHeight: 1.45 }}>{it.d}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
