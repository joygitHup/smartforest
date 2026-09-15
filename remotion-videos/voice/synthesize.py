# -*- coding: utf-8 -*-
"""为 linzhi 视频合成 Edge-TTS 中文旁白.

每段对应一个 Scene, 输出 mp3 到 voice/ 目录.
voice: zh-CN-YunjianNeural(男声, 沉稳有科技感)
"""
import asyncio, edge_tts, os, json
from pathlib import Path

OUT = Path(__file__).parent
OUT.mkdir(exist_ok=True)

# 场景号: (对应 PNG 文案, 配音文本)
SCRIPT = [
    (1, "林智森林智能监控平台——把万亩林区，装进一张实时更新的指挥地图"),
    (2, "森林防火，正面临发现慢、调度乱、追溯难，传统人工巡查难以匹配万亩林区压力"),
    (3, "我们打造一体化数字指挥平台，汇聚物联感知、规则预警与态势一张图，支撑从监测到复盘的完整业务闭环"),
    (4, "四层解耦架构：展示交互、应用服务、数据、设备接入，灵活扩展，稳定可靠"),
    (5, "指挥中心，态势一张图，秒级刷新设备与告警态势，关键指标大屏尽览"),
    (6, "多类型设备统一台账：双光谱云台、环境站、网关、无人机，遥测可视、远程可控、指令可查"),
    (7, "可配置规则引擎，分级预警不漏报也不打扰，工单派单闭环跟踪"),
    (8, "从告警到火情一键溯源，处置过程完整留痕，报表中心支撑运营复盘"),
    (9, "六大技术壁垒，从单机试点到县级生产规模平滑扩展"),
    (10, "林业主管部门、林场、保护区、森防机构，四类客户四维价值"),
    (11, "私有化部署，信创友好，与生态伙伴共建智慧林草"),
    (12, "守护绿水青山，从每一亩感知开始"),
]

# 男声沉稳有张力 (云健/zh-CN-YunjianNeural). rate -8% 略慢、显沉稳
VOICE = "zh-CN-YunjianNeural"
RATE = "-6%"
PITCH = "-2Hz"

async def synth_one(idx, text):
    out = OUT / f"scene_{idx:02d}.mp3"
    c = edge_tts.Communicate(text, voice=VOICE, rate=RATE, pitch=PITCH)
    await c.save(str(out))
    return idx, out, len(text)

async def main():
    results = await asyncio.gather(*(synth_one(i, t) for i, t in SCRIPT))
    meta = []
    for i, p, n in results:
        sz = os.path.getsize(p)
        meta.append({"idx": i, "file": p.name, "chars": n, "bytes": sz})
        print(f"[ok] {p.name}  {sz//1024}KB  chars={n}")
    (OUT / "manifest.json").write_text(
        json.dumps({"voice": VOICE, "rate": RATE, "pitch": PITCH, "scenes": meta}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

asyncio.run(main())
