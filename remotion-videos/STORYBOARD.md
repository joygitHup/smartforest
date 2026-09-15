# 林智森林智能监控平台 — 产品介绍视频

> 90 秒完整版 · 1920×1080 · 30fps · Remotion 4.0.409

## 视频信息

| 项目 | 值 |
|---|---|
| 分辨率 | 1920 × 1080 (16:9) |
| 帧率 | 30 fps |
| 总时长 | 3000 帧 = 100 秒 |
| 配音 | Edge TTS · zh-CN-YunjianNeural (云健男声) |
| BGM | XPR — sunbyrn (ccMixter, CC BY 3.0), 音量 32% |
| 设计语言 | Deep Night Command Center (深夜指挥中心) |

## 场景规划 (12 场景)

| # | 标签 | 帧数 | 时长 | 配音时长 | 内容要点 |
|---|---|---|---|---|---|
| 1 | COVER | 240 | 8.0s | 7.63s | 雷达封面 + 主标题 + 4 信息格 |
| 2 | PAINS | 285 | 9.5s | 8.88s | 4 大痛点卡(红色警示) |
| 3 | POSITION | 330 | 11.0s | 10.68s | 一体化平台定位 + 业务闭环 4 步 |
| 4 | ARCH | 270 | 9.0s | 8.66s | 四层解耦架构 + 模块芯片 |
| 5 | OPS-CONSOLE | 255 | 8.5s | 8.02s | 指挥中心态势一张图 + GIS |
| 6 | DEVICES | 330 | 11.0s | 10.68s | 4 类设备 + 6 项管理能力 |
| 7 | ALERT | 225 | 7.5s | 6.84s | 规则引擎 + 告警闭环 |
| 8 | FIRE-INVEST | 255 | 8.5s | 7.85s | 火情溯源 2×2 + 报表中心 |
| 9 | TECH | 210 | 7.0s | 6.17s | 六大技术优势 3×2 |
| 10 | SCENARIOS | 225 | 7.5s | 6.79s | 四类客户 + 四维价值 |
| 11 | DEPLOY | 210 | 7.0s | 6.31s | 3 部署形态 + 信创条 + 3 合作 |
| 12 | OUTRO | 165 | 5.5s | 4.42s | 雷达封底 + 品牌语 + 联系胶囊 |

**总计**: 3000 帧 = 100s;配音合计 92.93s,每段留 0.5~1.5s 出入场缓冲。

## 文件结构

```
remotion-videos/
├── src/
│   ├── index.ts                # 入口
│   ├── Root.tsx                # Composition 注册 (3000 帧 @30fps)
│   ├── theme.ts                # 设计令牌 + SCENES 帧分配
│   ├── animations.ts           # 动画 hooks (useFadeUp/useStagger/useFadeOut...)
│   ├── Background.tsx          # DeepBg/HudFrame/RadarDots/GlassCard + 字体
│   └── compositions/linzhi-product/
│       ├── Video.tsx           # 编排器(12 Sequence + BGM + 配音)
│       └── Scene01..12*.tsx    # 12 个场景组件
├── public/
│   ├── sunbyrn_-_XPR.mp3       # BGM (ccMixter, CC BY 3.0)
│   ├── voice/scene_01..12.mp3  # Edge TTS 配音
│   └── ATTRIBUTION.txt         # BGM 版权署名
├── voice/                      # 配音源文件 + synthesize.py + manifest
├── output/linzhi-product-intro.mp4  # 渲染输出
└── remotion.config.ts
```

## 渲染命令

```bash
npx remotion render src/index.ts LinZhiProduct output/linzhi-product-intro.mp4
```

预览单帧缩略图:

```bash
npx remotion still src/index.ts LinZhiProduct out/thumbnail.png
```

## BGM 署名

- **Track**: XPR by sunbyrn — https://ccmixter.org/files/sunbyrn/1305
- **License**: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/
- 使用方式:全片铺底,音量 32%,与配音不抢。
