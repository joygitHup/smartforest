// Scene11Deploy 部署方案与合作模式 — 3 部署形态 + 信创条 + 3 合作模式
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const DEPLOYS = [
  { t: '单机试点', d: '一体化部署，快速验证，适合演示与首个林区试点', c: COLORS.green },
  { t: '县级生产', d: '应用与数据分节点，多实例部署，支撑区域规模化运行', c: COLORS.blue },
  { t: '集群扩展', d: 'Docker + Kubernetes 编排，HPA 弹性伸缩，按需扩容', c: COLORS.cyan },
];
const COOPS = [
  { t: '试点共建', d: '选定重点林区先行试点，以真实运行数据验证价值后规模推广', c: COLORS.green },
  { t: '区域授权', d: '面向林业局、森防指挥中心的区域化交付与授权合作',         c: COLORS.blue  },
  { t: '定制开发', d: '设备协议适配、GIS 底图集成、业务流程按需深度定制',         c: COLORS.amber },
];

export const Scene11Deploy: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const dep = useStagger(DEPLOYS, 26, 6);
  const coo = useStagger(COOPS,   30, 10);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.blue}/>
      <div style={{ position: 'absolute', left: 140, top: 74, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 24, color: COLORS.blue, fontWeight: 600, letterSpacing: 3 }}>
        06 · DEPLOYMENT & PARTNERSHIP
      </div>
      <div style={{ position: 'absolute', left: 140, top: 112, ...useFadeUp(12),
        fontFamily: FONT_ZH, fontSize: 58, color: COLORS.txt, fontWeight: 700 }}>部署方案与合作模式</div>

      {/* 部署形态副标题 */}
      <div style={{ position: 'absolute', left: 140, top: 200, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 25, color: COLORS.txt, fontWeight: 700 }}>
        <span style={{ color: COLORS.blue, marginRight: 12 }}>▍</span>部署形态 · 从试点到生产
      </div>

      {/* 部署形态 3 卡 + 箭头 */}
      <div style={{ position: 'absolute', left: 130, top: 246, right: 130,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
        {dep.map(({ it, op: aop, ty }, i) => (
          <div key={i} style={{
            opacity: aop, transform: `translateY(${ty}px)`,
            background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 10,
            padding: '22px 26px', minHeight: 168, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5,
              background: it.c, boxShadow: `0 0 20px ${it.c}99` }}/>
            <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: it.c, fontWeight: 700, marginBottom: 12 }}>{it.t}</div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 20, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
            {i < 2 && (
              <div style={{ position: 'absolute', right: -23, top: '50%', marginTop: -16,
                width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent',
                borderLeft: `18px solid ${COLORS.border2}`, opacity: 0.7 }}/>
            )}
          </div>
        ))}
      </div>

      {/* 信创条 */}
      <div style={{ position: 'absolute', left: 130, top: 452, right: 130, ...useFadeUp(70),
        background: COLORS.card2, border: `1px solid ${COLORS.border}`, borderRadius: 10,
        padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ flexShrink: 0, padding: '8px 18px', background: COLORS.blue,
          borderRadius: 6, fontFamily: FONT_ZH, fontSize: 21, color: '#fff', fontWeight: 700,
          boxShadow: `0 0 16px ${COLORS.blue}88` }}>信创友好</div>
        <div style={{ fontFamily: FONT_ZH, fontSize: 21, color: COLORS.sub, lineHeight: 1.5 }}>
          全栈开源技术路线（Linux · PostgreSQL · Redis · EMQX · TDengine），支持私有化部署，数据不出林区，满足涉密与合规要求
        </div>
      </div>

      {/* 合作模式副标题 */}
      <div style={{ position: 'absolute', left: 140, top: 560, ...useFadeUp(90),
        fontFamily: FONT_ZH, fontSize: 25, color: COLORS.txt, fontWeight: 700 }}>
        <span style={{ color: COLORS.green, marginRight: 12 }}>▍</span>合作模式 · PARTNERSHIP
      </div>

      {/* 合作模式 3 卡 */}
      <div style={{ position: 'absolute', left: 130, top: 606, right: 130,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
        {coo.map(({ it, op: aop, ty }, i) => (
          <div key={i} style={{
            opacity: aop, transform: `translateY(${ty}px)`,
            background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 10,
            padding: '22px 26px', minHeight: 175, position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 13, height: 13, background: it.c, boxShadow: `0 0 14px ${it.c}` }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 28, color: it.c, fontWeight: 700 }}>{it.t}</div>
            </div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 20, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
          </div>
        ))}
      </div>

      {/* 底部副标语 */}
      <div style={{ position: 'absolute', bottom: 46, left: 0, right: 0, ...useFadeUp(120),
        textAlign: 'center', fontFamily: FONT_ZH, fontSize: 22, color: COLORS.sub, letterSpacing: 2 }}>
        灵活部署、平滑扩展，与生态伙伴共建智慧林草
      </div>
    </AbsoluteFill>
  );
};
