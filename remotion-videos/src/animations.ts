import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TIMING } from './theme';

/** 淡入 + 上滑入场(标准容器入场) */
export function useFadeUp(start: number, opts: { duration?: number; dist?: number } = {}) {
  const f = useCurrentFrame();
  const d = opts.duration ?? TIMING.fadeIn + 8;
  const dist = opts.dist ?? 30;
  return {
    opacity: interpolate(f, [start, start + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    transform: `translateY(${interpolate(f, [start, start + d], [dist, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
  };
}

/** spring 缩放入场 */
export function useSpringScale(start: number, from = 0.92) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = spring({ frame: Math.max(0, f - start), fps, config: { damping: 14, stiffness: 110, mass: 0.8 } });
  const scale = from + (1 - from) * v;
  return { scale, opacity: Math.max(0, Math.min(1, v + 0.05)) };
}

/** 缓出退出(场景末尾收尾) */
export function useFadeOut(end: number, opts: { duration?: number } = {}) {
  const f = useCurrentFrame();
  const d = opts.duration ?? TIMING.fadeOut;
  return interpolate(f, [end - d, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/** 文字 typewriter 切片 */
export function useTypewriter(start: number, text: string, speedFrames = 2) {
  const f = useCurrentFrame();
  const idx = Math.max(0, Math.floor((f - start) / speedFrames));
  return text.slice(0, Math.min(text.length, idx));
}

/** 错落 fadeIn: 给 items 数组配 stagger */
export function useStagger<T>(items: T[], start: number, gap = 8) {
  const f = useCurrentFrame();
  return items.map((it, i) => {
    const s = start + i * gap;
    const op = interpolate(f, [s, s + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const ty = interpolate(f, [s, s + 26], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return { it, op, ty };
  });
}
