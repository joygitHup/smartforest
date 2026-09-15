# -*- coding: utf-8 -*-
"""用 ffmpeg.probe 测量音频时长(ms)，更稳."""
import json, sys, subprocess
from pathlib import Path

FFMPEG = Path(r"C:\Users\lenovo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe")

def dur_ms(mp3: Path) -> float:
    # 用 ffprobe(同一个 bin)读取
    out = subprocess.run([str(FFMPEG.with_name('ffprobe.exe')), '-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', str(mp3)],
                         capture_output=True, text=True, timeout=30)
    return float(out.stdout.strip()) * 1000

def sec(ms: float) -> str:
    s = int(round(ms/1000))
    return f"{s}s{s%1:.0f}" if False else f"{s//60}:{s%60:02d}"

base = Path(r"D:\pythonDev\smartforest\remotion-videos")
print("BGM XPR: %.1fs" % (dur_ms(base/'public/sunbyrn_-_XPR.mp3')/1000))
for i in range(1,13):
    p = base/f"voice/scene_{i:02d}.mp3"
    d = dur_ms(p)
    print(f"scene_{i:02d}.mp3: {d/1000:.2f}s  (={d:.0f}ms)")
