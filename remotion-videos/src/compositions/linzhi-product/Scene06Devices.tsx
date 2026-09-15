// Scene06Devices 设备管理 — 4 设备类型 + 6 能力矩阵
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut, useStagger } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const DEVS = [
  { t: '双光谱云台', d: '可见光 + 热成像，烟火识别与姿态控制', c: COLORS.red   },
  { t: '环境监测站', d: '温湿度等林间小气候要素持续采集',         c: COLORS.green },
  { t: '物联网关',   d: '边缘汇聚，协议转换，离线缓存补传',     c: COLORS.blue  },
  { t: '无人机',     d: '机动巡查，火情现场快速抵近侦察',         c: COLORS.cyan  },
];
const CAPS = [
  { t: '台账管理', d: '按名称、类型、状态、林区多条件检索，新增编辑全生命周期维护' },
  { t: '状态监测', d: '在线状态、心跳时间实时监控，设备异常即时感知'                 },
  { t: '遥测可视', d: '温度、湿度、姿态等实时遥测数据曲线展示'                       },
  { t: '远程控制', d: '授权范围内云台姿态调整与预设控制，指令应答全程记录'           },
  { t: '接入管道', d: 'MQTT 接入 + 消息队列削峰保序，遥测 QoS0 / 控制 QoS1'         },
  { t: '离线感知', d: '遗嘱消息机制，设备掉线自动告警，杜绝「假在线」'               },
];

export const Scene06Devices: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const devs = useStagger(DEVS, 30, 14);
  const caps = useStagger(CAPS, 100, 12);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.cyan}/>
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.cyan, fontWeight: 600, letterSpacing: 3 }}>
        04 · CORE FEATURES
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, ...useFadeUp(14),
        fontFamily: FONT_ZH, fontSize: 70, color: COLORS.txt, fontWeight: 700 }}>全域感知 — 设备接入与管理</div>
      <div style={{ position: 'absolute', left: 140, top: 268, width: 1500, ...useFadeUp(24),
        fontFamily: FONT_ZH, fontSize: 26, color: COLORS.sub }}>多类型监测设备统一台账，遥测可视、远程可控、指令可查</div>

      {/* 设备类型 */}
      <div style={{ position: 'absolute', left: 130, top: 360, width: 1670 }}>
        <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700, marginBottom: 22 }}>接入设备类型</div>
        <div style={{ display: 'flex', gap: 22 }}>
          {devs.map(({ it, op, ty }, i) => (
            <div key={i} style={{ flex: 1, position: 'relative', opacity: op, transform: `translateY(${ty}px)`,
              background: COLORS.card, border: `1px solid ${COLORS.border2}`, borderRadius: 12,
              padding: '28px 30px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: it.c, boxShadow: `0 0 18px ${it.c}AA` }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 36, color: COLORS.txt, fontWeight: 700, marginBottom: 14 }}>{it.t}</div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 21, color: COLORS.sub, lineHeight: 1.45 }}>{it.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 管理能力矩阵 */}
      <div style={{ position: 'absolute', left: 130, top: 700, width: 1670 }}>
        <div style={{ fontFamily: FONT_ZH, fontSize: 30, color: COLORS.txt, fontWeight: 700, marginBottom: 22 }}>管理能力矩阵</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
          {caps.map(({ it, op, ty }, i) => (
            <div key={i} style={{ position: 'relative', opacity: op, transform: `translateY(${ty}px)`,
              background: COLORS.card2, border: `1px solid ${COLORS.border}`, borderRadius: 12,
              padding: '24px 28px', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 28, top: 32, width: 14, height: 14, background: COLORS.cyan }}/>
              <div style={{ fontFamily: FONT_ZH, fontSize: 28, color: COLORS.txt, fontWeight: 700, marginBottom: 10, paddingLeft: 28 }}>{it.t}</div>
              <div style={{ fontFamily: FONT_ZH, fontSize: 19, color: COLORS.sub, lineHeight: 1.45 }}>{it.d}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
