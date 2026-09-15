// Scene04Arch 平台架构 — 4 层堆叠
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, HudFrame, FONT_ZH, FONT_MONO } from '../../Background';
import { COLORS } from '../../theme';
import { useFadeUp, useFadeOut } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

const LAYERS = [
  { name: '展示交互层', c: COLORS.blue,
    mods: ['指挥中心 · 态势一张图','设备管理','告警中心 · 工单','火情溯源','报表中心','系统设置 · 运维'],
    tech: 'Next.js 16 · React 19 · GIS 地图引擎 · WebSocket 实时刷新' },
  { name: '应用服务层', c: COLORS.cyan,
    mods: ['身份认证 · JWT','规则引擎','工单流转','站内信 · 值班排班','组织权限 RBAC','运维诊断'],
    tech: 'Django 5 · DRF · Celery 异步任务 · Channels 实时通信' },
  { name: '数据层',     c: COLORS.green,
    mods: ['业务数据 · PostgreSQL','时序遥测 · TDengine','缓存 · Redis','消息队列 · Kafka','对象存储 · MinIO/S3'],
    tech: '业务与时序分治存储，冷热分离，高频遥测高性能读写' },
  { name: '设备接入层', c: COLORS.amber,
    mods: ['双光谱云台','环境监测站','物联网关','无人机','MQTT · EMQX'],
    tech: 'MQTT 统一接入 · 消息队列削峰保序 · 遥测/控制指令分级 QoS' },
];

const SUB_COLOR_FOR: Record<string,string> = {
  '指挥中心 · 态势一张图': COLORS.green, '设备管理': COLORS.blue, '告警中心 · 工单': COLORS.amber, '火情溯源': COLORS.red, '报表中心': COLORS.cyan, '系统设置 · 运维': COLORS.sub,
  '身份认证 · JWT': COLORS.blue, '规则引擎': COLORS.amber, '工单流转': COLORS.green, '站内信 · 值班排班': COLORS.cyan, '组织权限 RBAC': COLORS.sub, '运维诊断': COLORS.red,
  '业务数据 · PostgreSQL': COLORS.blue, '时序遥测 · TDengine': COLORS.green, '缓存 · Redis': COLORS.red, '消息队列 · Kafka': COLORS.amber, '对象存储 · MinIO/S3': COLORS.cyan,
  '双光谱云台': COLORS.red, '环境监测站': COLORS.green, '物联网关': COLORS.blue, '无人机': COLORS.cyan, 'MQTT · EMQX': COLORS.amber,
};

export const Scene04Arch: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      <HudFrame color={COLORS.cyan}/>
      <div style={{ position: 'absolute', left: 140, top: 130, ...useFadeUp(4),
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.cyan, fontWeight: 600, letterSpacing: 3 }}>
        03 · ARCHITECTURE
      </div>
      <div style={{ position: 'absolute', left: 140, top: 175, ...useFadeUp(16),
        fontFamily: FONT_ZH, fontSize: 72, color: COLORS.txt, fontWeight: 700 }}>平台总体架构</div>
      <div style={{ position: 'absolute', left: 140, top: 270, width: 1500, ...useFadeUp(28),
        fontFamily: FONT_ZH, fontSize: 26, color: COLORS.sub }}>展示交互 · 应用服务 · 数据 · 设备接入 —— 四层解耦，稳定可扩展</div>

      {LAYERS.map((L, i) => {
        const y = 380 + i * 158;
        return (
          <div key={i} style={{ position: 'absolute', left: 130, top: y, width: 1670, height: 138, ...useFadeUp(50 + i * 16) }}>
            <div style={{ position: 'absolute', inset: 0, background: COLORS.card, border: `1px solid ${COLORS.border2}`,
              borderRadius: 12, overflow: 'hidden' }}/>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: L.c,
              boxShadow: `0 0 22px ${L.c}AA` }}/>
            {/* 左：层名称 */}
            <div style={{ position: 'absolute', left: 50, top: 24, width: 380 }}>
              <div style={{ fontFamily: FONT_ZH, fontSize: 36, color: L.c, fontWeight: 700 }}>{L.name}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 16, color: COLORS.sub, marginTop: 8 }}>{L.tech.split(' · ')[0]}</div>
            </div>
            {/* 中：模块 chips */}
            <div style={{ position: 'absolute', left: 470, top: 20, display: 'flex', flexWrap: 'wrap', gap: 10, maxWidth: 1200 }}>
              {L.mods.map((m, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  background: COLORS.card2, border: `1px solid ${COLORS.border}`, borderRadius: 6,
                  padding: '8px 14px', fontFamily: FONT_ZH, fontSize: 18, color: COLORS.txt, fontWeight: 600 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: SUB_COLOR_FOR[m] || COLORS.sub }}/>
                  {m}
                </div>
              ))}
            </div>
            {/* 底部 tech line */}
            <div style={{ position: 'absolute', left: 470, top: 102, width: 1180,
              fontFamily: FONT_MONO, fontSize: 14, color: COLORS.sub }}>{L.tech}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
