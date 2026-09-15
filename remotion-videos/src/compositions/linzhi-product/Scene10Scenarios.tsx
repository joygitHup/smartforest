// Scene10Scenarios 应用场景与客户价值 — 4 类客户(横排) + 4 项价值(2x2)
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const CUSTOMERS = [
  { t: '林业主管部门', d: '区域森林防火数字化监管，多林场统一纳管',         c: COLORS.blue  },
  { t: '国有林场',     d: '万亩林区 7×24 智能值守，降低巡护人力成本',         c: COLORS.green },
  { t: '自然保护区',   d: '生态资源保护与火情防控双重保障',                  c: COLORS.cyan  },
  { t: '森防值班机构', d: '值班排班 + 告警联动，值守作业规范高效',           c: COLORS.amber },
];
const VALUES = [
  { t: '发现时效', d: '从「小时级巡护发现」到「分钟级自动预警」，抢占黄金处置窗口',  c: COLORS.red   },
  { t: '指挥效率', d: '一图统览全局态势，告警到派单一键流转，指挥链路大幅缩短',     c: COLORS.blue  },
  { t: '过程合规', d: '处置全程留痕可溯，复盘考核有据可依，责任边界清晰',           c: COLORS.amber },
  { t: '成本优化', d: '无人值守替代重复巡护，人力与车辆巡护成本显著下降',           c: COLORS.green },
];

export const Scene10Scenarios: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const cus = useStagger(CUSTOMERS, 22, 6);
  const val = useStagger(VALUES, 28, 10);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.green}/>
      <div style={{ position: 'absolute', left: 140, top: 110, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.green, fontWeight: 600, letterSpacing: 3 }}>
        06 · SCENARIOS & VALUE
      </div>
      <div style={{ position: 'absolute', left: 140, top: 155, ...useFadeUp(14),
        fontFamily: FONT_ZH, fontSize: 66, color: COLORS.txt, fontWeight: 700 }}>应用场景与客户价值</div>
      <div style={{ position: 'absolute', left: 140, top: 244, width: 1500, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 24, color: COLORS.sub }}>四类核心客户，四维价值提升</div>

      {/* 顶部: 4 类客户 */}
      <div style={{ position: 'absolute', left: 130, top: 320, right: 130,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {cus.map(({ it, op: aop, ty }, i) => (
          <div key={i} style={{
            opacity: aop, transform: `translateY(${ty}px)`,
            background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 10,
            padding: '24px 26px', minHeight: 175, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5,
              background: it.c, boxShadow: `0 0 18px ${it.c}99` }}/>
            <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: it.c, fontWeight: 700, marginBottom: 14 }}>{it.t}</div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 21, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
          </div>
        ))}
      </div>

      {/* 价值副标题 */}
      <div style={{ position: 'absolute', left: 140, top: 540, ...useFadeUp(60),
        fontFamily: FONT_MONO, fontSize: 22, color: COLORS.green, fontWeight: 700, letterSpacing: 3 }}>
        客户价值 · VALUE PROPOSITION
      </div>

      {/* 底部: 4 项价值 2x2 */}
      <div style={{ position: 'absolute', left: 130, top: 600, right: 130,
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {val.map(({ it, op: aop, ty }, i) => (
          <div key={i} style={{
            opacity: aop, transform: `translateY(${ty}px)`,
            background: COLORS.card2, border: `1px solid ${COLORS.border}`, borderRadius: 10,
            padding: '22px 28px', minHeight: 160, position: 'relative', display: 'flex', gap: 18, alignItems: 'center',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 6, height: '100%', background: it.c, boxShadow: `0 0 14px ${it.c}88` }}/>
            <div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 32, color: it.c, fontWeight: 700, marginBottom: 10 }}>{it.t}</div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 21, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
