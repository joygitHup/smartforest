/**
 * 共享背景层 — 三段渐变底 + 环境光晕 + 顶部发丝线 + HUD 角框
 * 与 PPT GEN 脚本 的 bg() / header() 一致
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from './theme';

export const DeepBg: React.FC = () => (
  <AbsoluteFill style={{
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgMid} 50%, ${COLORS.bgBot} 100%)`,
    overflow: 'hidden',
  }}>
    {/* 三处环境光晕 */}
    <div style={{
      position: 'absolute', top: -260, left: -300, width: 700, height: 700, borderRadius: '50%',
      background: `radial-gradient(circle, ${COLORS.blue}55 0%, transparent 60%)`,
      filter: 'blur(40px)',
    }}/>
    <div style={{
      position: 'absolute', top: -210, right: -180, width: 620, height: 620, borderRadius: '50%',
      background: `radial-gradient(circle, ${COLORS.cyan}55 0%, transparent 60%)`,
      filter: 'blur(40px)',
    }}/>
    <div style={{
      position: 'absolute', bottom: -180, left: -180, width: 560, height: 560, borderRadius: '50%',
      background: `radial-gradient(circle, ${COLORS.glowDeep}66 0%, transparent 60%)`,
      filter: 'blur(50px)',
    }}/>
    {/* 顶部发丝线(发光) */}
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 3,
      background: COLORS.hair, opacity: 0.65,
      boxShadow: `0 0 18px 2px ${COLORS.hair}88`,
    }}/>
  </AbsoluteFill>
);

/** 顶部 HUD 角框 + 顶部细线 (内容页通用) */
export const HudFrame: React.FC<{ color?: string }> = ({ color = COLORS.blue }) => (
  <>
    <div style={{
      position: 'absolute', top: 38, left: 64,
      width: 38, height: 38,
      borderTop: `2.5px solid ${color}`, borderLeft: `2.5px solid ${color}`,
      opacity: 0.6,
    }}/>
    <div style={{
      position: 'absolute', top: 38, right: 64,
      width: 38, height: 38,
      borderTop: `2.5px solid ${color}`, borderRight: `2.5px solid ${color}`,
      opacity: 0.6,
    }}/>
    {/* 顶左品牌色块 */}
    <div style={{
      position: 'absolute', top: 78, left: 100,
      width: 12, height: 100, background: color,
      borderRadius: 2, boxShadow: `0 0 16px ${color}88`,
    }}/>
  </>
);

/** 雷达 / 同心圆装饰 */
export const RadarDots: React.FC<{ cx: number; cy: number; size?: number; color?: string; pulse?: boolean }> = ({
  cx, cy, size = 200, color = COLORS.cyan, pulse,
}) => {
  const f = useCurrentFrame();
  const rings = [size, size * 1.6, size * 2.3, size * 3.0];
  return (
    <div style={{ position: 'absolute', left: cx - size * 1.5, top: cy - size * 1.5, width: size * 3, height: size * 3, pointerEvents: 'none' }}>
      {rings.map((r, i) => (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '50%',
          width: r, height: r, marginLeft: -r/2, marginTop: -r/2,
          border: `1px solid ${color}`, borderRadius: '50%',
          opacity: 0.4 - i * 0.07,
        }}/>
      ))}
      {/* 中心辉光 */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: pulse ? 14 + interpolate(f, [0, 60], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 14,
        height: pulse ? 14 + interpolate(f, [0, 60], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 14,
        marginLeft: -7, marginTop: -7,
        borderRadius: '50%', background: COLORS.green,
        boxShadow: `0 0 24px ${COLORS.green}`,
      }}/>
      {/* 四个十字刻度 */}
      {([[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]] as [number, number][]).map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(${p[0]*size}px, ${p[1]*size}px)`,
          fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 18, color: COLORS.border2,
          marginLeft: -8, marginTop: -10, opacity: 0.7,
        }}>+</div>
      ))}
    </div>
  );
};

/** 卡片(玻璃渐变 + 顶霓虹条) */
export const GlassCard: React.FC<{
  x: number; y: number; w: number; h: number; color?: string;
  rimTop?: number; withTopBar?: boolean;
}> = ({ x, y, w, h, color = COLORS.blue, rimTop, withTopBar = true }) => (
  <>
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      background: `linear-gradient(180deg, ${COLORS.cardTop} 0%, ${COLORS.cardBot} 100%)`,
      borderRadius: 14, border: `1px solid ${COLORS.border2}`,
      boxShadow: `0 18px 50px rgba(0,0,0,0.5)`,
    }}/>
    {withTopBar && (
      <div style={{
        position: 'absolute', left: x, top: y, width: w, height: rimTop ?? 8,
        background: color, borderRadius: '14px 14px 0 0',
        boxShadow: `0 0 22px ${color}99`,
      }}/>
    )}
  </>
);

/** 中文主字体(走系统 fallback): 优先 Microsoft YaHei */
export const FONT_ZH = '"PingFang SC","Microsoft YaHei","Source Han Sans SC","Noto Sans SC",sans-serif';
export const FONT_EN = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONT_MONO = '"JetBrains Mono","Fira Code","Consolas",monospace';
