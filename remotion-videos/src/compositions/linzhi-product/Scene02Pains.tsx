// Scene02Pains 行业痛点 — 红色调, 4 卡片
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, GlassCard, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const PAINS = [
  { t: '发现滞后', c: COLORS.red, d: '人工巡护覆盖有限，烟火初起难以第一时间发现，错过黄金处置窗口' },
  { t: '调度低效', c: COLORS.amber, d: '电话调度 + 群消息协同，信息碎片化，缺乏全局态势视图' },
  { t: '告警泛滥', c: COLORS.blue, d: '传统阈值告警缺乏治理，重复告警与告警风暴淹没真实险情' },
  { t: '追溯困难', c: COLORS.cyan, d: '处置过程无记录、无闭环，事后复盘与责任认定缺乏依据' },
];

export const Scene02Pains: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const cards = useStagger(PAINS, 24, 18);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.red}/>
      {/* 顶部 kicker + 标题 */}
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.red, fontWeight: 600, letterSpacing: 3 }}>
        01 · INDUSTRY CHALLENGES
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, width: 1500, ...useFadeUp(20),
        fontFamily: FONT_ZH, fontSize: 64, color: COLORS.txt, fontWeight: 700, lineHeight: 1.15 }}>
        森林防火正面临<br/>
        「发现慢 · 调度乱 · 追溯难」
      </div>

      {/* 4 个痛点卡片 */}
      {cards.map(({ it, op, ty }, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        const x = 130 + col * 420;
        const y = 440 + row * 0;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: 388, height: 360,
            opacity: op, transform: `translateY(${ty}px)` }}>
            <GlassCard x={0} y={0} w={388} h={360} color={it.c} />
            <div style={{ position: 'absolute', left: 36, top: 50,
              fontFamily: FONT_ZH, fontSize: 44, color: COLORS.txt, fontWeight: 700 }}>{it.t}</div>
            <div style={{ position: 'absolute', left: 36, top: 130, width: 320,
              fontFamily: FONT_ZH, fontSize: 24, color: COLORS.sub, lineHeight: 1.5 }}>{it.d}</div>
          </div>
        );
      })}

      {/* 底部价值陈述 */}
      <div style={{ position: 'absolute', left: 130, top: 850, width: 1670, ...useFadeUp(120),
        display: 'flex', flexDirection: 'row', alignItems: 'stretch',
        background: `linear-gradient(180deg, #18263F 0%, #0D182B 100%)`,
        border: `1px solid ${COLORS.border2}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ width: 12, background: COLORS.red, boxShadow: `0 0 22px ${COLORS.red}99` }}/>
        <div style={{ padding: '30px 40px' }}>
          <div style={{ fontFamily: FONT_ZH, fontSize: 36, color: COLORS.txt, fontWeight: 700, marginBottom: 14 }}>
            每一次迟到的发现，代价都可能是一座山头。
          </div>
          <div style={{ fontFamily: FONT_ZH, fontSize: 22, color: COLORS.sub, lineHeight: 1.6 }}>
            森林火灾蔓延速度快、扑救成本高、生态损失不可逆。数字化转型的核心，是把「被动响应」变为「主动防控」——
            让每一亩林区都被实时感知，让每一次告警都被闭环处置。
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
