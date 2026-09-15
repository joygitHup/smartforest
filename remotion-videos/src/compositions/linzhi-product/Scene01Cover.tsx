// Scene01Cover 封面: 雷达 + 标题 + 信息条
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { DeepBg, RadarDots, FONT_ZH, FONT_MONO, FONT_EN } from '../../Background';
import { COLORS, SIZES } from '../../theme';
import { useFadeUp, useFadeOut } from '../../animations';

interface Props { durationInFrames: number; sceneNum: number }

export const Scene01Cover: React.FC<Props> = ({ durationInFrames }) => {
  const f = useCurrentFrame();
  const fin  = interpolate(f, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fout = useFadeOut(durationInFrames);
  const op = fin * fout;

  const u1 = useFadeUp(6);
  const u2 = useFadeUp(28);
  const u3 = useFadeUp(60);
  const u4 = useFadeUp(100);
  const u5 = useFadeUp(140);

  return (
    <AbsoluteFill style={{ opacity: op }}>
      <DeepBg/>
      {/* 右上雷达 */}
      <div style={{ position: 'absolute', right: 0, top: 60 }}>
        <RadarDots cx={500} cy={500} size={140} color={COLORS.cyan} pulse />
      </div>
      {/* 左下光晕装饰 */}
      <div style={{
        position: 'absolute', bottom: -120, left: -120, width: 520, height: 520,
        borderRadius: '50%', background: `radial-gradient(circle, ${COLORS.blue}55 0%, transparent 70%)`,
        filter: 'blur(40px)',
      }}/>

      {/* Kicker 顶部 */}
      <div style={{
        position: 'absolute', left: 120, top: 240, ...u1,
        fontFamily: FONT_MONO, fontSize: 26, color: COLORS.cyan,
        letterSpacing: 4, fontWeight: 600,
      }}>SMART FOREST MONITORING PLATFORM</div>

      {/* 主标题 */}
      <div style={{
        position: 'absolute', left: 110, top: 290, width: 1500, ...u2,
        fontFamily: FONT_ZH, fontSize: 132, color: COLORS.txt,
        fontWeight: 700, lineHeight: 1.05, letterSpacing: 2,
      }}>林智森林智能监控平台</div>

      {/* 渐变发光下划线 */}
      <div style={{ position: 'absolute', left: 116, top: 530, width: 460, height: 7,
        borderRadius: 4, background: `linear-gradient(90deg, ${COLORS.cyan} 0%, ${COLORS.blue} 55%, #1D4ED8 100%)`,
        boxShadow: `0 0 26px ${COLORS.blue}AA`, opacity: u2.opacity * 0.9,
      }}/>

      {/* 副标语 */}
      <div style={{
        position: 'absolute', left: 120, top: 580, ...u3,
        fontFamily: FONT_ZH, fontSize: 48, color: COLORS.blue, fontWeight: 600,
      }}>全域感知 · 分级预警 · 一图指挥 · 过程可溯</div>

      {/* 描述 */}
      <div style={{
        position: 'absolute', left: 120, top: 690, width: 1100, ...u4,
        fontFamily: FONT_ZH, fontSize: 30, color: COLORS.sub, lineHeight: 1.55,
      }}>
        面向林业主管部门、国有林场、自然保护区与森防值班机构的森林防火数字化指挥平台——<br/>
        将传统人工巡查值守升级为 7×24 小时智能化监测预警能力。
      </div>

      {/* 底部 4 信息条(玻璃渐变卡) */}
      <div style={{ position: 'absolute', left: 120, top: 880, ...u5, width: 1240, height: 130,
        background: `linear-gradient(180deg, ${COLORS.cardTop} 0%, ${COLORS.cardBot} 100%)`,
        borderRadius: 14, border: `1px solid ${COLORS.border2}`,
        display: 'flex', flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: '#2E6BFF' }}/>
        {[
          ['设备接入', '多类型物联感知', COLORS.blue],
          ['响应时效', '秒级实时推送', COLORS.green],
          ['业务闭环', '监测-研判-处置-复盘', COLORS.amber],
          ['部署形态', '私有化 / 云端', COLORS.cyan],
        ].map(([k, v, c], i) => (
          <div key={i} style={{ flex: 1, padding: '20px 24px', borderLeft: i > 0 ? `1px solid ${COLORS.border}` : 'none',
            display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 20, color: COLORS.sub, marginBottom: 8 }}>{k}</div>
            <div style={{ fontFamily: FONT_ZH, fontSize: 28, color: c, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 右下版本 */}
      <div style={{
        position: 'absolute', right: 120, bottom: 50, opacity: u5.opacity,
        fontFamily: FONT_MONO, fontSize: 24, color: COLORS.sub,
      }}>PRODUCT BRIEF · V1.0 · 2026</div>
    </AbsoluteFill>
  );
};
