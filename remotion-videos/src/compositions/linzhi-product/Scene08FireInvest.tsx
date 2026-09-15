// Scene08FireInvest 火情溯源与决策支持 — 4 溯源能力 + 报表中心 4 项
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const TRACING = [
  { t: '事件原点定位', d: '火情、烟雾类事件的原点信息与时间线呈现',         c: COLORS.red   },
  { t: '关联告警聚合', d: '同一事件多源告警自动关联，还原事件全貌',          c: COLORS.amber },
  { t: '周边资源分析', d: '就近监测设备与处置力量一目了然，辅助调度决策',     c: COLORS.blue  },
  { t: '蔓延趋势研判', d: '结合态势图辅助研判火情蔓延方向与发展态势',         c: COLORS.cyan  },
];
const REPORTS = [
  { t: '运营日报', d: '设备运行、告警处置情况每日汇总，管理层一页掌握全局' },
  { t: '环境统计', d: '林区温湿度等环境要素趋势分析，支撑风险预判' },
  { t: '设备统计', d: '在线率、故障率、告警分布多维统计' },
  { t: '权限内导出', d: '统计范围与账号组织权限严格一致，数据不出权限边界' },
];

export const Scene08FireInvest: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const tr  = useStagger(TRACING, 28, 8);
  const rep = useStagger(REPORTS, 30, 12);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.red}/>
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.red, fontWeight: 600, letterSpacing: 3 }}>
        04 · CORE FEATURES
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, ...useFadeUp(14),
        fontFamily: FONT_ZH, fontSize: 66, color: COLORS.txt, fontWeight: 700 }}>火情溯源与决策支持</div>
      <div style={{ position: 'absolute', left: 140, top: 264, width: 1500, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 24, color: COLORS.sub }}>从告警到火情，为指挥员提供研判依据与调度抓手</div>

      {/* 左: 火情溯源 2x2 */}
      <div style={{ position: 'absolute', left: 130, top: 360, width: 1110, height: 600,
        background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12, padding: '30px 36px',
        overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: COLORS.red, boxShadow: `0 0 22px ${COLORS.red}AA` }}/>
        <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: COLORS.red, fontWeight: 700, marginBottom: 26, letterSpacing: 3 }}>火情溯源 · FIRE TRACING</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {tr.map(({ it, op: aop, ty }, i) => (
            <div key={i} style={{
              opacity: aop, transform: `translateY(${ty}px)`,
              background: COLORS.card2, border: `1px solid ${COLORS.border}`, borderRadius: 10,
              padding: '24px 26px', minHeight: 220, position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: it.c, boxShadow: `0 0 12px ${it.c}88` }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 14, height: 14, background: it.c, boxShadow: `0 0 12px ${it.c}` }}/>
                <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700 }}>{it.t}</div>
              </div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 22, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右: 报表中心 */}
      <div style={{ position: 'absolute', right: 130, top: 360, width: 510, height: 600,
        background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12, padding: '30px 36px',
        overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: COLORS.green, boxShadow: `0 0 22px ${COLORS.green}AA` }}/>
        <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: COLORS.green, fontWeight: 700, marginBottom: 26, letterSpacing: 3 }}>报表中心 · REPORTS</div>
        {rep.map(({ it, op: aop, ty }, i) => (
          <div key={i} style={{ marginBottom: 22, opacity: aop, transform: `translateY(${ty}px)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 12, height: 12, background: COLORS.green }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 26, color: COLORS.txt, fontWeight: 700 }}>{it.t}</div>
            </div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 19, color: COLORS.sub, paddingLeft: 26, lineHeight: 1.5 }}>{it.d}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
