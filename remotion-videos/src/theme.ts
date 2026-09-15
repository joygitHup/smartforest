/**
 * 设计令牌 — 与 PPT scripts/gen_ppt.py 完全一致
 * "深夜指挥中心" 视觉语言
 */
export const COLORS = {
  // 三段深邃渐变（自上而下）
  bgTop:   '#12243F',
  bgMid:   '#0A1628',
  bgBot:   '#04090F',
  // 卡片玻璃渐变
  cardTop: '#1D3050',
  cardBot: '#141F35',
  // 平涂
  card:    '#152238',
  card2:   '#111D31',
  border:  '#1E3A5F',
  border2: '#2A4A75',
  // 文字
  txt:     '#E8F1FF',
  sub:     '#8B9BB4',
  // 状态色
  blue:    '#3B82F6',
  green:   '#10B981',
  amber:   '#F59E0B',
  red:     '#EF4444',
  cyan:    '#06B6D4',
  // 装饰
  hair:    '#539DFF',     // 顶部发丝线
  glowDeep:'#1D4ED8',     // 深蓝环境光
  pillBorder: '#C9D6EA',
} as const;

export const SIZES = {
  // 1920x1080 设计
  W: 1920,
  H: 1080,
  // 安全边距
  padX: 100,
  padTop: 70,
  padBot: 110,
  // 字号(px)
  hero:    108,
  h1:      84,
  h2:      60,
  bodyLg:  44,
  body:    34,
  bodySm:  28,
  label:   24,
  kicker:  28,
  // 行高倍数
  lh:      1.35,
} as const;

export const TIMING = {
  fps: 30,
  totalFrames: 3000,    // 100 秒
  fadeIn:  18,          // 0.6s
  fadeOut: 18,
  slideUp: 26,
  crossfade: 22,
  springScale: 30,
} as const;

// 各 scene 长度 (frames @30fps) — 紧凑贴合配音 + 缓冲
export const SCENES = [
  // 1) 封面
  { n:1, frames: 240, label: 'COVER' },          // 8.0s
  { n:2, frames: 285, label: 'PAINS' },          // 9.5s
  { n:3, frames: 330, label: 'POSITION' },       // 11.0s
  { n:4, frames: 270, label: 'ARCH' },           // 9.0s
  { n:5, frames: 255, label: 'OPS-CONSOLE' },    // 8.5s
  { n:6, frames: 330, label: 'DEVICES' },        // 11.0s
  { n:7, frames: 225, label: 'ALERT' },          // 7.5s
  { n:8, frames: 255, label: 'FIRE-INVEST' },    // 8.5s
  { n:9, frames: 210, label: 'TECH' },           // 7.0s
  { n:10,frames: 225, label: 'SCENARIOS' },      // 7.5s
  { n:11,frames: 210, label: 'DEPLOY' },         // 7.0s
  { n:12,frames: 165, label: 'OUTRO' },          // 5.5s
] as const;
// 累计
export const CUM_FRAMES = SCENES.reduce((acc, s, i) => {
  const prev = i === 0 ? 0 : acc[i-1].to;
  acc.push({ n: s.n, from: prev, to: prev + s.frames });
  return acc;
}, [] as Array<{n:number,from:number,to:number}>);
export const TOTAL = CUM_FRAMES[CUM_FRAMES.length - 1].to; // 3000
