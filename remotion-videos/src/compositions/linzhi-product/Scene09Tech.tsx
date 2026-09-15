// Scene09Tech 六大技术优势 — 3x2 网格
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const TECHS = [
  { n: '01', t: '物联网分层接入', d: 'MQTT 统一接入 + 消息队列削峰分区保序，海量设备并发上报不丢不乱',  c: COLORS.blue  },
  { n: '02', t: '冷热数据分离',   d: '业务实体入 PostgreSQL，高频遥测入 TDengine 时序库，各得其所',         c: COLORS.green },
  { n: '03', t: '规则异步计算',   d: '规则评估与采集主链路解耦，规则缓存 + 触发冷却，告警风暴免疫',         c: COLORS.amber },
  { n: '04', t: '多租户安全模型', d: '组织树 × 林区 × 角色三重约束，多单位数据与操作严格隔离',              c: COLORS.red   },
  { n: '05', t: '全链路实时推送', d: 'WebSocket 秒级触达告警、设备状态与站内信，大屏值守不掉线',             c: COLORS.cyan  },
  { n: '06', t: '弹性水平扩展',   d: '异步任务按遥测、告警队列分流，应用多实例 + Docker/K8s 编排',           c: COLORS.blue  },
];

export const Scene09Tech: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const items = useStagger(TECHS, 24, 6);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.cyan}/>
      <div style={{ position: 'absolute', left: 140, top: 110, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.cyan, fontWeight: 600, letterSpacing: 3 }}>
        05 · TECHNOLOGY
      </div>
      <div style={{ position: 'absolute', left: 140, top: 155, ...useFadeUp(14),
        fontFamily: FONT_ZH, fontSize: 66, color: COLORS.txt, fontWeight: 700 }}>六大技术优势</div>
      <div style={{ position: 'absolute', left: 140, top: 244, width: 1500, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 24, color: COLORS.sub }}>工程化设计构筑产品壁垒，支撑从单机试点到县级生产规模的平滑扩展</div>

      <div style={{ position: 'absolute', left: 130, top: 330, right: 130,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {items.map(({ it, op: aop, ty }, i) => (
          <div key={i} style={{
            opacity: aop, transform: `translateY(${ty}px)`,
            background: `linear-gradient(180deg, ${COLORS.cardTop} 0%, ${COLORS.cardBot} 100%)`,
            border: `1px solid ${COLORS.border2}`, borderRadius: 12,
            padding: '32px 30px', minHeight: 280, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6,
              background: it.c, boxShadow: `0 0 22px ${it.c}99` }}/>
            <div style={{ fontFamily: FONT_MONO, fontSize: 36, color: it.c, fontWeight: 700, marginBottom: 20 }}>{it.n}</div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>{it.t}</div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 20, color: COLORS.sub, lineHeight: 1.55 }}>{it.d}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
