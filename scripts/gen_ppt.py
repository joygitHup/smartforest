# -*- coding: utf-8 -*-
"""林智森林智能监控平台 — 商业化产品介绍 PPT 生成脚本"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
import copy

# ---------- 设计令牌 ----------
BG      = RGBColor(0x0A, 0x16, 0x28)
BG2     = RGBColor(0x0F, 0x1E, 0x35)
CARD    = RGBColor(0x15, 0x22, 0x38)
CARD2   = RGBColor(0x11, 0x1D, 0x31)
BORDER  = RGBColor(0x1E, 0x3A, 0x5F)
TXT     = RGBColor(0xE8, 0xF1, 0xFF)
SUB     = RGBColor(0x8B, 0x9B, 0xB4)
BLUE    = RGBColor(0x3B, 0x82, 0xF6)
GREEN   = RGBColor(0x10, 0xB9, 0x81)
AMBER   = RGBColor(0xF5, 0x9E, 0x0B)
RED     = RGBColor(0xEF, 0x44, 0x44)
CYAN    = RGBColor(0x06, 0xB6, 0xD4)

BORDER2 = RGBColor(0x2A, 0x4A, 0x75)   # 更亮的描边(深底提亮)
# 渐变用色(hex 字符串)
G_TOP, G_MID, G_BOT = '12243F', '0A1628', '04090F'   # 页面背景: 上亮下暗深邃渐变
C_T, C_B = '1D3050', '141F35'                        # 卡片玻璃渐变: 上轻下重

FONT = "微软雅黑"
MONO = "Consolas"

SW, SH = Inches(13.333), Inches(7.5)

prs = Presentation()
prs.slide_width = SW
prs.slide_height = SH
BLANK = prs.slide_layouts[6]


# ---------- 基础工具 ----------
def _set_ea(run, name):
    run.font.name = name
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = rPr.makeelement(qn('a:ea'), {})
        rPr.append(ea)
    ea.set('typeface', name)


def set_alpha(shape, pct):
    """pct: 0~100 透明度百分比 (100=全透明)"""
    sF = shape.fill._xPr.find(qn('a:solidFill'))
    if sF is None:
        return
    clr = sF.find(qn('a:srgbClr'))
    if clr is None:
        return
    a = clr.makeelement(qn('a:alpha'), {'val': str(int((100 - pct) * 1000))})
    clr.append(a)


def rect(slide, x, y, w, h, fill=CARD, line=BORDER, line_w=1.0, shape=MSO_SHAPE.RECTANGLE, radius=None):
    sp = slide.shapes.add_shape(shape, x, y, w, h)
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line
        sp.line.width = Pt(line_w)
    sp.shadow.inherit = False
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            sp.adjustments[0] = radius
        except Exception:
            pass
    return sp


def txt(slide, x, y, w, h, lines, size=14, color=TXT, bold=False, align=PP_ALIGN.LEFT,
        anchor=MSO_ANCHOR.TOP, font=FONT, spacing=1.0, space_after=4):
    """lines: str 或 [(text,{size,color,bold,font}), ...] 或 list[str]"""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    if isinstance(lines, str):
        lines = [lines]
    first = True
    for ln in lines:
        if isinstance(ln, str):
            t, opt = ln, {}
        else:
            t, opt = ln
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(opt.get('space_after', space_after))
        r = p.add_run()
        r.text = t
        r.font.size = Pt(opt.get('size', size))
        r.font.color.rgb = opt.get('color', color)
        r.font.bold = opt.get('bold', bold)
        _set_ea(r, opt.get('font', font))
    return tb


# ---------- 渐变 / 辉光 / HUD 工具 ----------
_ACCENT_HEX = {
    BLUE: '3B82F6', GREEN: '10B981', AMBER: 'F59E0B', RED: 'EF4444',
    CYAN: '06B6D4', SUB: '8B9BB4', TXT: 'E8F1FF',
}


def hx(c):
    """RGBColor / hex 字符串 -> hex 字符串"""
    return _ACCENT_HEX.get(c, '3B82F6')


def _apply_grad(sp, stops, angle=90):
    """把形状填充替换为线性渐变; stops: [(pos0~1, hex), ...], angle: 度"""
    spPr = sp.fill._xPr
    for tag in ('a:solidFill', 'a:noFill', 'a:gradFill', 'a:blipFill', 'a:pattFill', 'a:grpFill'):
        for el in spPr.findall(qn(tag)):
            spPr.remove(el)
    gf = spPr.makeelement(qn('a:gradFill'), {})
    gsLst = spPr.makeelement(qn('a:gsLst'), {})
    for pos, col in stops:
        gs = spPr.makeelement(qn('a:gs'), {'pos': str(int(round(pos * 100000)))})
        clr = spPr.makeelement(qn('a:srgbClr'), {'val': col})
        gs.append(clr)
        gsLst.append(gs)
    lin = spPr.makeelement(qn('a:lin'), {'ang': str(int(angle * 60000)), 'scaled': '1'})
    gf.append(gsLst)
    gf.append(lin)
    spPr.insert_element_before(gf, 'a:ln', 'a:effectLst', 'a:effectDag',
                               'a:scene3d', 'a:sp3d', 'a:extLst')


def grad_rect(slide, x, y, w, h, stops, angle=90, line=None, line_w=1.0,
              shape=MSO_SHAPE.RECTANGLE, radius=None):
    sp = rect(slide, x, y, w, h, fill=CARD, line=line, line_w=line_w, shape=shape, radius=radius)
    _apply_grad(sp, stops, angle)
    return sp


def set_glow(sp, hexcol, opacity=55, blur_in=0.08):
    """给形状加霓虹外辉光 (outerShdw, blurRad)"""
    spPr = sp._element.spPr
    eL = spPr.find(qn('a:effectLst'))
    if eL is None:
        eL = spPr.makeelement(qn('a:effectLst'), {})
        spPr.insert_element_before(eL, 'a:effectDag', 'a:scene3d', 'a:sp3d', 'a:extLst')
    for el in eL.findall(qn('a:outerShdw')):
        eL.remove(el)
    sh = eL.makeelement(qn('a:outerShdw'), {
        'blurRad': str(int(blur_in * 914400)), 'dist': '0', 'dir': '0', 'rotWithShape': '0'})
    clr = eL.makeelement(qn('a:srgbClr'), {'val': hexcol})
    a = eL.makeelement(qn('a:alpha'), {'val': str(int(opacity * 1000))})
    clr.append(a)
    sh.append(clr)
    eL.append(sh)


def hud_frame(slide, s=0.30, inset=0.44):
    """顶部左右 HUD 角框(内容页统一取景框)"""
    x0, x1 = Inches(inset), Inches(13.333 - inset - s)
    y0 = Inches(inset)
    parts = [
        (x0, y0, Inches(s), Pt(1.6)),
        (x0, y0, Pt(1.6), Inches(s)),
        (x1, y0, Inches(s), Pt(1.6)),
        (x1 + Inches(s) - Pt(1.6), y0, Pt(1.6), Inches(s)),
    ]
    for (x, y, w, hh) in parts:
        sp = rect(slide, x, y, w, hh, fill=RGBColor(0x5B, 0x8D, 0xE0), line=None)
        set_alpha(sp, 62)


def bg(slide):
    """深邃渐变底 + 环境光晕 + 顶部霓虹发丝线"""
    grad_rect(slide, 0, 0, SW, SH, [(0, G_TOP), (0.5, G_MID), (1, G_BOT)], angle=90)
    a1 = dot(slide, Inches(-3.8), Inches(-3.6), Inches(9.0), BLUE)
    set_alpha(a1, 94)
    a2 = dot(slide, Inches(10.2), Inches(-3.0), Inches(7.0), CYAN)
    set_alpha(a2, 96)
    a3 = dot(slide, Inches(-2.8), Inches(4.4), Inches(8.0), RGBColor(0x1D, 0x4E, 0xD8))
    set_alpha(a3, 95)
    hair = rect(slide, 0, 0, SW, Pt(2.4), fill=RGBColor(0x53, 0x9D, 0xFF), line=None)
    set_alpha(hair, 45)
    set_glow(hair, '3B82F6', opacity=55, blur_in=0.05)
    return slide


def footer(slide, idx, total):
    """细基线 + 高亮段 + 品牌角标 + 页码胶囊"""
    rect(slide, Inches(0.6), Inches(7.12), Inches(12.13), Pt(1.0),
         fill=RGBColor(0x1C, 0x35, 0x58), line=None)
    hl = rect(slide, Inches(0.6), Inches(7.09), Inches(1.6), Pt(1.6), fill=BLUE, line=None)
    set_alpha(hl, 30)
    chip = rect(slide, Inches(0.6), Inches(7.26), Inches(0.18), Inches(0.18), fill=BLUE, line=None,
                shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
    set_glow(chip, '3B82F6', opacity=40, blur_in=0.03)
    txt(slide, Inches(0.92), Inches(7.25), Inches(5), Inches(0.22),
        "林智森林智能监控平台 · 产品介绍", size=8.5, color=SUB)
    pill = rect(slide, Inches(12.26), Inches(7.21), Inches(0.74), Inches(0.27), fill=CARD2,
                line=BORDER2, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
    txt(slide, Inches(12.26), Inches(7.255), Inches(0.74), Inches(0.2),
        f"{idx:02d}", size=9, color=RGBColor(0xC9, 0xD6, 0xEA), align=PP_ALIGN.CENTER, font=MONO)


def header(slide, kicker, title, desc=None, accent=BLUE):
    hud_frame(slide)
    bar = rect(slide, Inches(0.6), Inches(0.52), Inches(0.09), Inches(0.86), fill=accent, line=None)
    set_glow(bar, hx(accent), opacity=45, blur_in=0.06)
    txt(slide, Inches(0.88), Inches(0.5), Inches(10.5), Inches(0.3), kicker,
        size=12, color=accent, bold=True, font=MONO)
    txt(slide, Inches(0.88), Inches(0.8), Inches(11.5), Inches(0.6), title, size=27, bold=True)
    if desc:
        txt(slide, Inches(0.88), Inches(1.42), Inches(11.8), Inches(0.35), desc, size=12, color=SUB)


def deco_radar(slide, cx, cy, radii, color=CYAN):
    """装饰性雷达圈"""
    for r_in, alpha in radii:
        c = slide.shapes.add_shape(MSO_SHAPE.OVAL, Emu(int(cx - r_in)), Emu(int(cy - r_in)),
                                   Emu(int(r_in * 2)), Emu(int(r_in * 2)))
        c.fill.background()
        c.line.color.rgb = color
        c.line.width = Pt(0.75)
        c.shadow.inherit = False
        # 线条透明度
        ln = c.line._get_or_add_ln()
        sF = ln.find(qn('a:solidFill'))
        if sF is not None:
            clr = sF.find(qn('a:srgbClr'))
            if clr is not None:
                a = clr.makeelement(qn('a:alpha'), {'val': str(int((100 - alpha) * 1000))})
                clr.append(a)


def dot(slide, x, y, d, color, alpha=0):
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, y, d, d)
    s.fill.solid(); s.fill.fore_color.rgb = color
    s.line.fill.background(); s.shadow.inherit = False
    if alpha:
        set_alpha(s, alpha)
    return s


TOTAL = 13


def new_slide():
    return prs.slides.add_slide(BLANK)


# ============================================================
# S1 封面
# ============================================================
s = new_slide()
bg(s)
# 背景装饰: 右侧雷达 + 光晕 + 十字刻度 + 散点
g = dot(s, Inches(9.95), Inches(3.05), Inches(1.3), CYAN)
set_alpha(g, 88)
deco_radar(s, Emu(int(Inches(10.6))), Emu(int(Inches(3.7))),
           [(Inches(0.5), 18), (Inches(1.0), 35), (Inches(1.6), 52), (Inches(2.3), 70)])
core = dot(s, Inches(10.45), Inches(3.55), Inches(0.3), GREEN)
set_glow(core, '10B981', opacity=80, blur_in=0.1)
for (mx, my) in [(Inches(8.28), Inches(3.66)), (Inches(12.93), Inches(3.66)),
                 (Inches(10.56), Inches(1.38)), (Inches(10.56), Inches(6.02))]:
    txt(s, mx, my, Inches(0.5), Inches(0.3), "+", size=12,
        color=RGBColor(0x4A, 0x6B, 0x93), font=MONO)
dot(s, Inches(11.7), Inches(2.6), Inches(0.14), AMBER)
dot(s, Inches(9.6), Inches(5.2), Inches(0.1), RED)
dot(s, Inches(12.1), Inches(4.9), Inches(0.12), CYAN)
# 左下角大暗色几何 + 光晕
big = rect(s, Inches(-1.2), Inches(5.9), Inches(6), Inches(3.4), fill=BG2, line=None)
set_alpha(big, 30)
ac = dot(s, Inches(2.1), Inches(5.35), Inches(3.6), BLUE)
set_alpha(ac, 97)

# 品牌角标
logo = rect(s, Inches(0.6), Inches(0.55), Inches(0.5), Inches(0.5), fill=BLUE, line=None,
            shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.25)
set_glow(logo, '3B82F6', opacity=60, blur_in=0.09)
txt(s, Inches(0.6), Inches(0.62), Inches(0.5), Inches(0.4), "林", size=16, color=TXT,
    bold=True, align=PP_ALIGN.CENTER)
txt(s, Inches(1.22), Inches(0.55), Inches(4), Inches(0.28), "林智 LINZHI", size=13, bold=True)
txt(s, Inches(1.22), Inches(0.82), Inches(4), Inches(0.25), "森林智能监控平台", size=9, color=SUB)

# 主标题区
txt(s, Inches(0.9), Inches(2.0), Inches(9.5), Inches(0.3),
    "SMART FOREST MONITORING PLATFORM", size=12.5, color=CYAN, bold=True, font=MONO)
txt(s, Inches(0.86), Inches(2.38), Inches(10.6), Inches(1.15),
    "林智森林智能监控平台", size=48, bold=True)
# 渐变发光下划线
ul = grad_rect(s, Inches(0.92), Inches(3.64), Inches(3.3), Inches(0.05),
               [(0, '06B6D4'), (0.55, '3B82F6'), (1, '1D4ED8')], angle=0)
set_glow(ul, '3B82F6', opacity=70, blur_in=0.08)
txt(s, Inches(0.9), Inches(3.88), Inches(10.5), Inches(0.4),
    "全域感知 · 分级预警 · 一图指挥 · 过程可溯", size=17, color=BLUE, bold=True)
txt(s, Inches(0.9), Inches(4.38), Inches(9.8), Inches(0.7),
    "面向林业主管部门、国有林场、自然保护区与森防值班机构的森林防火数字化指挥平台，"
    "将传统人工巡查值守升级为 7×24 小时智能化监测预警能力。", size=12, color=SUB, spacing=1.3)

# 底部信息条(渐变卡片 + 发光分隔线)
bar = grad_rect(s, Inches(0.9), Inches(5.62), Inches(8.0), Inches(0.95),
                [(0, C_T), (1, C_B)], angle=90, line=BORDER2)
rect(s, Inches(0.9), Inches(5.62), Inches(8.0), Inches(0.04), fill=RGBColor(0x2E, 0x6B, 0xFF),
     line=None)
for i, (k, v, c) in enumerate([("设备接入", "多类型物联感知", BLUE), ("响应时效", "秒级实时推送", GREEN),
                               ("业务闭环", "监测-研判-处置-复盘", AMBER), ("部署形态", "私有化 / 云端", CYAN)]):
    x = Inches(1.2 + i * 1.97)
    txt(s, x, Inches(5.84), Inches(1.9), Inches(0.25), k, size=9, color=SUB, font=MONO)
    txt(s, x, Inches(6.12), Inches(1.9), Inches(0.3), v, size=11, color=c, bold=True)
for sx in (Inches(2.98), Inches(4.95), Inches(6.92)):
    rect(s, sx, Inches(5.88), Pt(1.0), Inches(0.44), fill=RGBColor(0x23, 0x3E, 0x63), line=None)

txt(s, Inches(0.9), Inches(6.95), Inches(8), Inches(0.3),
    "产品介绍  |  V1.0  |  2026", size=10, color=SUB, font=MONO)

# ============================================================
# S2 目录
# ============================================================
s = new_slide(); bg(s)
header(s, "CONTENTS", "目录", "从行业挑战到落地方案，一图了解林智平台全貌")
items = [
    ("01", "行业背景与挑战", "森林防火的四大痛点"),
    ("02", "产品定位与价值", "一体化数字指挥平台"),
    ("03", "平台总体架构", "四层架构 · 稳定可靠"),
    ("04", "核心功能", "态势一张图到告警闭环"),
    ("05", "技术优势", "六大技术壁垒"),
    ("06", "应用场景与合作", "场景落地 · 合作模式"),
]
TOC_COLORS = [RED, BLUE, CYAN, GREEN, AMBER, SUB]
for i, (num, t, d) in enumerate(items):
    col, row = i % 2, i // 2
    x = Inches(0.88 + col * 6.1)
    y = Inches(1.95 + row * 1.62)
    cc = TOC_COLORS[i]
    card = rect(s, x, y, Inches(5.7), Inches(1.38), fill=CARD, line=BORDER2)
    _apply_grad(card, [(0, C_T), (1, C_B)], angle=90)
    rect(s, x, y, Inches(5.7), Inches(0.05), fill=cc, line=None)
    # 发光序号方块
    box = rect(s, x + Inches(0.32), y + Inches(0.35), Inches(0.68), Inches(0.68), fill=cc,
               line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.24)
    set_alpha(box, 86)
    set_glow(box, hx(cc), opacity=45, blur_in=0.05)
    txt(s, x + Inches(0.32), y + Inches(0.43), Inches(0.68), Inches(0.5),
        num, size=20, color=TXT, bold=True, align=PP_ALIGN.CENTER, font=MONO)
    txt(s, x + Inches(1.28), y + Inches(0.34), Inches(4.2), Inches(0.42), t, size=17.5, bold=True)
    txt(s, x + Inches(1.28), y + Inches(0.84), Inches(4.2), Inches(0.35), d, size=11, color=SUB)
footer(s, 2, TOTAL)

# ============================================================
# S3 行业背景与挑战
# ============================================================
s = new_slide(); bg(s)
header(s, "01 · INDUSTRY CHALLENGES", "森林防火，正面临「发现慢 · 调度乱 · 追溯难」",
       "传统人工巡查、电话调度、即时通讯群协同的作业方式，已难以匹配万亩林区的防火压力", accent=RED)
pains = [
    ("发现滞后", RED, "人工巡护覆盖有限，烟火初起难以第一时间发现，错过黄金处置窗口"),
    ("调度低效", AMBER, "电话调度 + 群消息协同，信息碎片化，指挥员缺乏全局态势视图"),
    ("告警泛滥", BLUE, "传统阈值告警缺乏治理，重复告警与告警风暴淹没真实险情"),
    ("追溯困难", CYAN, "处置过程无记录、无闭环，事后复盘、责任认定与考核缺乏依据"),
]
for i, (t, c, d) in enumerate(pains):
    x = Inches(0.88 + i * 3.02)
    card = rect(s, x, Inches(2.1), Inches(2.82), Inches(2.6), fill=CARD, line=BORDER2)
    _apply_grad(card, [(0, C_T), (1, C_B)], angle=90)
    tb = rect(s, x, Inches(2.1), Inches(2.82), Inches(0.07), fill=c, line=None)
    set_glow(tb, hx(c), opacity=60, blur_in=0.07)
    txt(s, x + Inches(0.28), Inches(2.42), Inches(2.3), Inches(0.4), t, size=17, bold=True)
    txt(s, x + Inches(0.28), Inches(2.95), Inches(2.28), Inches(1.6), d, size=11, color=SUB, spacing=1.35)

# 底部价值陈述
band = rect(s, Inches(0.88), Inches(5.05), Inches(11.56), Inches(1.6), fill=CARD2, line=BORDER2)
_apply_grad(band, [(0, '18263F'), (1, '0D182B')], angle=90)
lb = rect(s, Inches(0.88), Inches(5.05), Inches(0.09), Inches(1.6), fill=RED, line=None)
set_glow(lb, 'EF4444', opacity=55, blur_in=0.05)
txt(s, Inches(1.2), Inches(5.3), Inches(11), Inches(0.35),
    "每一次迟到的发现，代价都可能是一座山头", size=15, bold=True, color=TXT)
txt(s, Inches(1.2), Inches(5.78), Inches(11), Inches(0.6),
    "森林火灾蔓延速度快、扑救成本高、生态损失不可逆。数字化转型的核心目标，就是把「被动响应」变为「主动防控」——"
    "让每一亩林区都被实时感知，让每一次告警都被闭环处置。", size=11, color=SUB, spacing=1.4)
footer(s, 3, TOTAL)

# ============================================================
# S4 产品定位
# ============================================================
s = new_slide(); bg(s)
header(s, "02 · POSITIONING", "一体化数字指挥平台", "汇聚物联感知、规则预警、GIS 态势与工单闭环，支撑「监测—研判—处置—复盘」业务闭环")
# 中央定位语
hero = rect(s, Inches(0.88), Inches(1.95), Inches(11.56), Inches(1.35), fill=CARD, line=BORDER)
rect(s, Inches(0.88), Inches(1.95), Inches(0.08), Inches(1.35), fill=BLUE, line=None)
txt(s, Inches(1.3), Inches(2.16), Inches(10.8), Inches(0.45),
    "把万亩林区，装进一张实时更新的指挥地图", size=20, bold=True)
txt(s, Inches(1.3), Inches(2.7), Inches(10.8), Inches(0.4),
    "LinZhi Forest Intelligent Monitoring Platform —— 森林防火与林区运行监测的数字化底座",
    size=11, color=SUB, font=MONO)

# 业务闭环流程
txt(s, Inches(0.88), Inches(3.55), Inches(6), Inches(0.3), "业务闭环 · CLOSED-LOOP WORKFLOW", size=11, color=BLUE, bold=True, font=MONO)
steps = [("监测", "物联设备 7×24 遥测", GREEN), ("研判", "规则引擎分级预警", BLUE),
         ("处置", "工单派单闭环跟踪", AMBER), ("复盘", "过程留痕考核沉淀", CYAN)]
for i, (t, d, c) in enumerate(steps):
    x = Inches(0.88 + i * 3.02)
    card = rect(s, x, Inches(3.95), Inches(2.6), Inches(1.15), fill=CARD, line=BORDER)
    dot(s, x + Inches(0.25), Inches(4.17), Inches(0.18), c)
    txt(s, x + Inches(0.58), Inches(4.08), Inches(1.9), Inches(0.35), t, size=16, bold=True)
    txt(s, x + Inches(0.58), Inches(4.5), Inches(2.0), Inches(0.3), d, size=10, color=SUB)
    if i < 3:
        ar = rect(s, x + Inches(2.66), Inches(4.38), Inches(0.32), Inches(0.24), fill=BORDER, line=None, shape=MSO_SHAPE.RIGHT_ARROW)

# 三大价值主张
vals = [("全域感知", "双光谱云台、环境站、网关、无人机统一接入，遥测数据实时汇聚", GREEN),
        ("分级预警", "可配置规则引擎 + 告警冷却，险情分级触达，不漏报也不打扰", BLUE),
        ("一图指挥", "GIS 态势一张图集中呈现设备与告警，点击即下钻、即调度", AMBER)]
for i, (t, d, c) in enumerate(vals):
    x = Inches(0.88 + i * 3.94)
    card = rect(s, x, Inches(5.4), Inches(3.72), Inches(1.42), fill=CARD2, line=BORDER)
    rect(s, x, Inches(5.4), Inches(3.72), Inches(0.06), fill=c, line=None)
    txt(s, x + Inches(0.28), Inches(5.62), Inches(3.2), Inches(0.35), t, size=15, bold=True, color=c)
    txt(s, x + Inches(0.28), Inches(6.05), Inches(3.2), Inches(0.7), d, size=10.5, color=SUB, spacing=1.3)
footer(s, 4, TOTAL)

# ============================================================
# S5 平台总体架构
# ============================================================
s = new_slide(); bg(s)
header(s, "03 · ARCHITECTURE", "平台总体架构", "展示交互 · 应用服务 · 数据 · 设备接入，四层解耦，稳定可扩展")
layers = [
    ("展示交互层", BLUE, [
        ("指挥中心 · 态势一张图", GREEN), ("设备管理", BLUE), ("告警中心 · 工单", AMBER),
        ("火情溯源", RED), ("报表中心", CYAN), ("系统设置 · 运维", SUB)],
        "Next.js 16 · React 19 · GIS 地图引擎 · WebSocket 实时刷新"),
    ("应用服务层", CYAN, [
        ("身份认证 · JWT", BLUE), ("规则引擎", AMBER), ("工单流转", GREEN),
        ("站内信 · 值班排班", CYAN), ("组织权限 RBAC", SUB), ("运维诊断", RED)],
        "Django 5 · DRF · Celery 异步任务 · Channels 实时通信"),
    ("数据层", GREEN, [
        ("业务数据 · PostgreSQL", BLUE), ("时序遥测 · TDengine", GREEN),
        ("缓存 · Redis", RED), ("消息队列 · Kafka", AMBER), ("对象存储 · MinIO/S3", CYAN)],
        "业务与时序分治存储，冷热分离，高频遥测高性能读写"),
    ("设备接入层", AMBER, [
        ("双光谱云台", RED), ("环境监测站", GREEN), ("物联网关", BLUE), ("无人机", CYAN), ("MQTT · EMQX", AMBER)],
        "MQTT 统一接入 · 消息队列削峰保序 · 遥测/控制指令分级 QoS"),
]
y = 1.95
for name, c, mods, tech in layers:
    band = rect(s, Inches(0.88), Inches(y), Inches(11.56), Inches(1.15), fill=CARD, line=BORDER)
    rect(s, Inches(0.88), Inches(y), Inches(0.07), Inches(1.15), fill=c, line=None)
    txt(s, Inches(1.15), Inches(y + 0.18), Inches(1.6), Inches(0.4), name, size=15, bold=True, color=c)
    txt(s, Inches(1.15), Inches(y + 0.6), Inches(1.7), Inches(0.5), tech.split(" · ")[0], size=8.5, color=SUB)
    for j, (m, mc) in enumerate(mods):
        mx = Inches(3.0 + j * 1.62)
        chip = rect(s, mx, Inches(y + 0.22), Inches(1.5), Inches(0.42), fill=CARD2, line=BORDER)
        dot(s, mx + Inches(0.12), Inches(y + 0.37), Inches(0.1), mc)
        txt(s, mx + Inches(0.26), Inches(y + 0.28), Inches(1.22), Inches(0.3), m, size=8.5,
            color=TXT, bold=True)
    txt(s, Inches(3.0), Inches(y + 0.76), Inches(9.3), Inches(0.3), tech, size=9, color=SUB, font=MONO)
    y += 1.26
footer(s, 5, TOTAL)

# ============================================================
# S6 核心功能 · 指挥中心
# ============================================================
s = new_slide(); bg(s)
header(s, "04 · CORE FEATURES", "指挥中心 —— 态势一张图", "关键运行指标 + GIS 实时态势，值班指挥的核心驾驶舱", accent=GREEN)
# 左：指标卡
metrics = [("设备总数", "ALL DEVICES", BLUE), ("在线率", "ONLINE RATE", GREEN),
           ("未处理告警", "PENDING ALERTS", AMBER), ("火情事件", "FIRE EVENTS", RED)]
txt(s, Inches(0.88), Inches(1.9), Inches(5), Inches(0.3), "运行指标总览", size=13, bold=True)
for i, (t, en, c) in enumerate(metrics):
    x = Inches(0.88 + (i % 2) * 2.75)
    y = Inches(2.3) + Inches((i // 2) * 1.05)
    card = rect(s, x, y, Inches(2.55), Inches(0.9), fill=CARD, line=BORDER)
    rect(s, x, y, Inches(0.06), Inches(0.9), fill=c, line=None)
    txt(s, x + Inches(0.22), y + Inches(0.12), Inches(2.2), Inches(0.28), en, size=8, color=c, font=MONO)
    txt(s, x + Inches(0.22), y + Inches(0.4), Inches(2.2), Inches(0.35), t, size=14, bold=True)

# 右：GIS 态势特性
panel = rect(s, Inches(6.5), Inches(1.9), Inches(5.94), Inches(4.9), fill=CARD, line=BORDER)
txt(s, Inches(6.8), Inches(2.12), Inches(5.3), Inches(0.3), "GIS 实时态势", size=13, bold=True, color=GREEN)
feats = [
    ("实时点位渲染", "设备与告警分布实时呈现，缩小地图点位仍可辨识，杜绝监控空窗误判", GREEN),
    ("图层与过滤", "支持图层切换、按林区过滤，多维度聚焦重点区域", BLUE),
    ("秒级刷新", "WebSocket 推送设备状态与告警，值班大屏实时联动", CYAN),
    ("一键下钻", "悬停查看设备摘要，点击进入详情或直接下发云台控制指令", AMBER),
]
for i, (t, d, c) in enumerate(feats):
    y = Inches(2.55 + i * 1.05)
    dot(s, Inches(6.85), y + Inches(0.06), Inches(0.16), c)
    txt(s, Inches(7.15), y, Inches(5.0), Inches(0.32), t, size=13, bold=True)
    txt(s, Inches(7.15), y + Inches(0.36), Inches(5.05), Inches(0.6), d, size=10.5, color=SUB, spacing=1.25)

# 左下补充
low = rect(s, Inches(0.88), Inches(4.55), Inches(5.3), Inches(2.25), fill=CARD2, line=BORDER)
txt(s, Inches(1.15), Inches(4.78), Inches(4.8), Inches(0.3), "为值班指挥而设计", size=13, bold=True, color=BLUE)
pts = ["凌晨两点，弧形大屏上的幽蓝光晕，每一个像素都承载守护万亩森林的责任",
       "告警按视觉优先级分层呈现：红色火情 > 琥珀预警 > 绿色正常",
       "等宽数据字体精确对齐，低亮度夜间值守环境依然清晰可读"]
for i, p in enumerate(pts):
    y = Inches(5.18 + i * 0.52)
    rect(s, Inches(1.15), y + Inches(0.07), Inches(0.1), Inches(0.1), fill=BLUE, line=None)
    txt(s, Inches(1.4), y, Inches(4.6), Inches(0.5), p, size=10, color=SUB, spacing=1.2)
footer(s, 6, TOTAL)

# ============================================================
# S7 核心功能 · 设备管理
# ============================================================
s = new_slide(); bg(s)
header(s, "04 · CORE FEATURES", "全域感知 —— 设备接入与管理", "多类型监测设备统一台账，遥测可视、远程可控、指令可查", accent=CYAN)
# 设备类型
devs = [("双光谱云台", "可见光 + 热成像，烟火识别与姿态控制", RED),
        ("环境监测站", "温湿度等林间小气候要素持续采集", GREEN),
        ("物联网关", "边缘汇聚，协议转换，离线缓存补传", BLUE),
        ("无人机", "机动巡查，火情现场快速抵近侦察", CYAN)]
txt(s, Inches(0.88), Inches(1.85), Inches(6), Inches(0.3), "接入设备类型", size=13, bold=True)
for i, (t, d, c) in enumerate(devs):
    x = Inches(0.88 + i * 2.98)
    card = rect(s, x, Inches(2.22), Inches(2.78), Inches(1.5), fill=CARD, line=BORDER)
    rect(s, x, Inches(2.22), Inches(2.78), Inches(0.06), fill=c, line=None)
    txt(s, x + Inches(0.25), Inches(2.42), Inches(2.3), Inches(0.35), t, size=15, bold=True)
    txt(s, x + Inches(0.25), Inches(2.85), Inches(2.32), Inches(0.75), d, size=10, color=SUB, spacing=1.25)

# 管理能力矩阵
caps = [
    ("台账管理", "按名称、类型、状态、林区多条件检索，新增编辑全生命周期维护"),
    ("状态监测", "在线状态、心跳时间实时监控，设备异常即时感知"),
    ("遥测可视", "温度、湿度、姿态等实时遥测数据曲线展示"),
    ("远程控制", "授权范围内云台姿态调整与预设控制，指令应答全程记录"),
    ("接入管道", "MQTT 接入 + 消息队列削峰保序，遥测 QoS0 / 控制 QoS1"),
    ("离线感知", "遗嘱消息机制，设备掉线自动告警，杜绝「假在线」"),
]
for i, (t, d) in enumerate(caps):
    col, row = i % 3, i // 3
    x = Inches(0.88 + col * 3.94)
    y = Inches(4.0) + Inches(row * 1.35)
    card = rect(s, x, y, Inches(3.72), Inches(1.2), fill=CARD2, line=BORDER)
    rect(s, x + Inches(0.25), y + Inches(0.28), Inches(0.12), Inches(0.12), fill=CYAN, line=None)
    txt(s, x + Inches(0.5), y + Inches(0.18), Inches(3.0), Inches(0.32), t, size=13, bold=True)
    txt(s, x + Inches(0.5), y + Inches(0.56), Inches(3.05), Inches(0.6), d, size=10, color=SUB, spacing=1.2)
footer(s, 7, TOTAL)

# ============================================================
# S8 核心功能 · 智能预警
# ============================================================
s = new_slide(); bg(s)
header(s, "04 · CORE FEATURES", "智能预警 —— 规则引擎与告警闭环", "可配置规则 + 工单流转 + 值班联动，让每一条告警都被处置、被记录", accent=AMBER)
# 左：规则引擎
left = rect(s, Inches(0.88), Inches(1.9), Inches(5.6), Inches(4.9), fill=CARD, line=BORDER)
txt(s, Inches(1.15), Inches(2.12), Inches(5), Inches(0.32), "规则引擎 · RULE ENGINE", size=13, bold=True, color=AMBER)
rules = [
    ("多维规则配置", "告警类型、级别、阈值、作用范围（设备类型 / 指定设备 / 林区）、推送渠道灵活组合"),
    ("双形态规则", "系统默认规则开箱即用，组织自建规则按需扩展"),
    ("异步评估", "规则评估与遥测入库解耦，不阻塞采集主路径"),
    ("告警冷却", "同类规则触发冷却期，抑制短时重复告警，杜绝告警风暴"),
]
for i, (t, d) in enumerate(rules):
    y = Inches(2.6 + i * 1.02)
    rect(s, Inches(1.15), y + Inches(0.06), Inches(0.12), Inches(0.12), fill=AMBER, line=None)
    txt(s, Inches(1.4), y, Inches(4.8), Inches(0.32), t, size=12.5, bold=True)
    txt(s, Inches(1.4), y + Inches(0.36), Inches(4.85), Inches(0.6), d, size=10, color=SUB, spacing=1.2)

# 右：告警闭环流程
right = rect(s, Inches(6.72), Inches(1.9), Inches(5.72), Inches(4.9), fill=CARD, line=BORDER)
txt(s, Inches(6.99), Inches(2.12), Inches(5), Inches(0.32), "告警闭环 · ALERT CLOSED-LOOP", size=13, bold=True, color=GREEN)
flow = [("告警产生", "规则命中自动生成", RED), ("值班确认", "站内信 + 值班联动触达", AMBER),
        ("派单处置", "转化为可跟踪工单", BLUE), ("办结归档", "办结 / 误报状态流转", GREEN)]
for i, (t, d, c) in enumerate(flow):
    y = Inches(2.62 + i * 0.78)
    num = rect(s, Inches(6.99), y, Inches(0.52), Inches(0.52), fill=c, line=None,
               shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
    txt(s, Inches(6.99), y + Inches(0.09), Inches(0.52), Inches(0.35), f"{i+1}", size=15,
        bold=True, color=RGBColor(0xFF, 0xFF, 0xFF), align=PP_ALIGN.CENTER, font=MONO)
    txt(s, Inches(7.7), y + Inches(0.0), Inches(4.5), Inches(0.3), t, size=12.5, bold=True)
    txt(s, Inches(7.7), y + Inches(0.3), Inches(4.5), Inches(0.28), d, size=9.5, color=SUB)
    if i < 3:
        rect(s, Inches(7.24), y + Inches(0.55), Inches(0.02), Inches(0.22), fill=BORDER, line=None)
# 处理记录
rec = rect(s, Inches(6.99), Inches(5.85), Inches(5.2), Inches(0.75), fill=CARD2, line=BORDER)
txt(s, Inches(7.2), Inches(5.97), Inches(4.9), Inches(0.55),
    "处理记录完整留存处置过程与责任人，支持事后复盘、责任认定与绩效考核",
    size=10.5, color=SUB, spacing=1.25)
footer(s, 8, TOTAL)

# ============================================================
# S9 核心功能 · 火情溯源 + 报表
# ============================================================
s = new_slide(); bg(s)
header(s, "04 · CORE FEATURES", "火情溯源与决策支持", "从告警到火情，为指挥员提供研判依据与调度抓手", accent=RED)
# 左：火情溯源
left = rect(s, Inches(0.88), Inches(1.9), Inches(6.7), Inches(4.9), fill=CARD, line=BORDER)
rect(s, Inches(0.88), Inches(1.9), Inches(6.7), Inches(0.07), fill=RED, line=None)
txt(s, Inches(1.18), Inches(2.15), Inches(6), Inches(0.35), "火情溯源 · FIRE TRACING", size=14, bold=True, color=RED)
tr_items = [
    ("事件原点定位", "火情、烟雾类事件的原点信息与时间线呈现", RED),
    ("关联告警聚合", "同一事件的多源告警自动关联，还原事件全貌", AMBER),
    ("周边资源分析", "就近监测设备与处置力量一目了然，辅助调度决策", BLUE),
    ("蔓延趋势研判", "结合态势图辅助研判火情蔓延方向与发展态势", CYAN),
]
for i, (t, d, c) in enumerate(tr_items):
    col, row = i % 2, i // 2
    x = Inches(1.18 + col * 3.15)
    y = Inches(2.75 + row * 1.95)
    card = rect(s, x, y, Inches(2.95), Inches(1.75), fill=CARD2, line=BORDER)
    dot(s, x + Inches(0.25), y + Inches(0.3), Inches(0.16), c)
    txt(s, x + Inches(0.55), y + Inches(0.22), Inches(2.3), Inches(0.35), t, size=13, bold=True)
    txt(s, x + Inches(0.28), y + Inches(0.72), Inches(2.5), Inches(0.9), d, size=10, color=SUB, spacing=1.3)

# 右：报表中心
right = rect(s, Inches(7.82), Inches(1.9), Inches(4.62), Inches(4.9), fill=CARD, line=BORDER)
rect(s, Inches(7.82), Inches(1.9), Inches(4.62), Inches(0.07), fill=GREEN, line=None)
txt(s, Inches(8.12), Inches(2.15), Inches(4), Inches(0.35), "报表中心 · REPORTS", size=14, bold=True, color=GREEN)
rp = [("运营日报", "设备运行、告警处置情况每日汇总，管理层一页掌握全局"),
      ("环境统计", "林区温湿度等环境要素趋势分析，支撑风险预判"),
      ("设备统计", "在线率、故障率、告警分布多维统计"),
      ("权限内导出", "统计范围与账号组织权限严格一致，数据不出权限边界")]
for i, (t, d) in enumerate(rp):
    y = Inches(2.72 + i * 1.0)
    rect(s, Inches(8.12), y + Inches(0.06), Inches(0.12), Inches(0.12), fill=GREEN, line=None)
    txt(s, Inches(8.37), y, Inches(3.9), Inches(0.3), t, size=12.5, bold=True)
    txt(s, Inches(8.37), y + Inches(0.34), Inches(3.9), Inches(0.6), d, size=10, color=SUB, spacing=1.2)
footer(s, 9, TOTAL)

# ============================================================
# S10 技术优势
# ============================================================
s = new_slide(); bg(s)
header(s, "05 · TECHNOLOGY", "六大技术优势", "工程化设计构筑产品壁垒，支撑从单机试点到县级生产规模的平滑扩展", accent=CYAN)
techs = [
    ("物联网分层接入", "MQTT 统一接入 + 消息队列削峰分区保序，海量设备并发上报不丢不乱", BLUE),
    ("冷热数据分离", "业务实体入 PostgreSQL，高频遥测入 TDengine 时序库，各得其所", GREEN),
    ("规则异步计算", "规则评估与采集主链路解耦，规则缓存 + 触发冷却，告警风暴免疫", AMBER),
    ("多租户安全模型", "组织树 × 林区 × 角色三重约束，多单位数据与操作严格隔离", RED),
    ("全链路实时推送", "WebSocket 秒级触达告警、设备状态与站内信，大屏值守不掉线", CYAN),
    ("弹性水平扩展", "异步任务按遥测、告警队列分流，应用多实例 + Docker/K8s 编排", BLUE),
]
for i, (t, d, c) in enumerate(techs):
    col, row = i % 3, i // 3
    x = Inches(0.88 + col * 3.94)
    y = Inches(1.95 + row * 2.42)
    card = rect(s, x, y, Inches(3.72), Inches(2.2), fill=CARD, line=BORDER2)
    _apply_grad(card, [(0, C_T), (1, C_B)], angle=90)
    tb = rect(s, x, y, Inches(3.72), Inches(0.07), fill=c, line=None)
    set_glow(tb, hx(c), opacity=55, blur_in=0.06)
    txt(s, x + Inches(0.3), y + Inches(0.28), Inches(0.8), Inches(0.5), f"0{i+1}", size=22,
        color=c, bold=True, font=MONO)
    txt(s, x + Inches(0.3), y + Inches(0.82), Inches(3.15), Inches(0.4), t, size=15, bold=True)
    txt(s, x + Inches(0.3), y + Inches(1.3), Inches(3.2), Inches(0.8), d, size=10.5, color=SUB, spacing=1.3)
footer(s, 10, TOTAL)

# ============================================================
# S11 应用场景与客户价值
# ============================================================
s = new_slide(); bg(s)
header(s, "06 · SCENARIOS & VALUE", "应用场景与客户价值", "四类核心客户，四维价值提升", accent=GREEN)
scenes = [("林业主管部门", "区域森林防火数字化监管，多林场统一纳管", BLUE),
          ("国有林场", "万亩林区 7×24 智能值守，降低巡护人力成本", GREEN),
          ("自然保护区", "生态资源保护与火情防控双重保障", CYAN),
          ("森防值班机构", "值班排班 + 告警联动，值守作业规范高效", AMBER)]
for i, (t, d, c) in enumerate(scenes):
    x = Inches(0.88 + i * 3.02)
    card = rect(s, x, Inches(1.95), Inches(2.82), Inches(1.65), fill=CARD, line=BORDER)
    rect(s, x, Inches(1.95), Inches(2.82), Inches(0.06), fill=c, line=None)
    txt(s, x + Inches(0.26), Inches(2.2), Inches(2.35), Inches(0.35), t, size=14, bold=True, color=c)
    txt(s, x + Inches(0.26), Inches(2.62), Inches(2.38), Inches(0.85), d, size=10, color=SUB, spacing=1.25)

# 价值量化
txt(s, Inches(0.88), Inches(3.9), Inches(6), Inches(0.3), "客户价值 · VALUE PROPOSITION", size=11, color=GREEN, bold=True, font=MONO)
vals = [("发现时效", "从「小时级巡护发现」到「分钟级自动预警」，抢占黄金处置窗口", RED),
        ("指挥效率", "一图统览全局态势，告警到派单一键流转，指挥链路大幅缩短", BLUE),
        ("过程合规", "处置全程留痕可溯，复盘考核有据可依，责任边界清晰", AMBER),
        ("成本优化", "无人值守替代重复巡护，人力与车辆巡护成本显著下降", GREEN)]
for i, (t, d, c) in enumerate(vals):
    col, row = i % 2, i // 2
    x = Inches(0.88 + col * 5.85)
    y = Inches(4.3 + row * 1.25)
    card = rect(s, x, y, Inches(5.65), Inches(1.1), fill=CARD2, line=BORDER)
    rect(s, x, y, Inches(0.07), Inches(1.1), fill=c, line=None)
    txt(s, x + Inches(0.3), y + Inches(0.16), Inches(5.0), Inches(0.35), t, size=14, bold=True, color=c)
    txt(s, x + Inches(0.3), y + Inches(0.58), Inches(5.1), Inches(0.45), d, size=10.5, color=SUB)
footer(s, 11, TOTAL)

# ============================================================
# S12 部署与合作
# ============================================================
s = new_slide(); bg(s)
header(s, "06 · DEPLOYMENT & PARTNERSHIP", "部署方案与合作模式", "灵活部署、平滑扩展，与生态伙伴共建智慧林草", accent=BLUE)
# 部署形态
txt(s, Inches(0.88), Inches(1.9), Inches(6), Inches(0.3), "部署形态 · 从试点到生产", size=13, bold=True)
deps = [("单机试点", "一体化部署，快速验证，适合演示与首个林区试点", GREEN),
        ("县级生产", "应用与数据分节点，多实例部署，支撑区域规模化运行", BLUE),
        ("集群扩展", "Docker + Kubernetes 编排，HPA 弹性伸缩，按需扩容", CYAN)]
for i, (t, d, c) in enumerate(deps):
    x = Inches(0.88 + i * 3.94)
    card = rect(s, x, Inches(2.3), Inches(3.72), Inches(1.5), fill=CARD, line=BORDER)
    rect(s, x, Inches(2.3), Inches(3.72), Inches(0.06), fill=c, line=None)
    txt(s, x + Inches(0.28), Inches(2.52), Inches(3.2), Inches(0.35), t, size=15, bold=True, color=c)
    txt(s, x + Inches(0.28), Inches(2.95), Inches(3.2), Inches(0.7), d, size=10.5, color=SUB, spacing=1.25)
    if i < 2:
        rect(s, x + Inches(3.76), Inches(2.9), Inches(0.28), Inches(0.22), fill=BORDER, line=None, shape=MSO_SHAPE.RIGHT_ARROW)

# 技术底座条
band = rect(s, Inches(0.88), Inches(4.0), Inches(11.56), Inches(0.85), fill=CARD2, line=BORDER)
txt(s, Inches(1.15), Inches(4.13), Inches(2.0), Inches(0.3), "信创友好", size=12, bold=True, color=BLUE)
txt(s, Inches(1.15), Inches(4.45), Inches(11), Inches(0.3),
    "全栈开源技术路线（Linux · PostgreSQL · Redis · EMQX · TDengine），支持私有化部署，数据不出林区，满足涉密与合规要求",
    size=10.5, color=SUB)

# 合作模式
txt(s, Inches(0.88), Inches(5.1), Inches(6), Inches(0.3), "合作模式 · PARTNERSHIP", size=13, bold=True)
coops = [("试点共建", "选定重点林区先行试点，以真实运行数据验证价值后规模推广", GREEN),
         ("区域授权", "面向林业局、森防指挥中心的区域化交付与授权合作", BLUE),
         ("定制开发", "设备协议适配、GIS 底图集成、业务流程按需深度定制", AMBER)]
for i, (t, d, c) in enumerate(coops):
    x = Inches(0.88 + i * 3.94)
    card = rect(s, x, Inches(5.5), Inches(3.72), Inches(1.3), fill=CARD, line=BORDER)
    rect(s, x + Inches(0.28), y_ := Inches(5.72), Inches(0.12), Inches(0.12), fill=c, line=None)
    txt(s, x + Inches(0.52), Inches(5.64), Inches(3.0), Inches(0.32), t, size=13.5, bold=True, color=c)
    txt(s, x + Inches(0.28), Inches(6.04), Inches(3.2), Inches(0.65), d, size=10, color=SUB, spacing=1.2)
footer(s, 12, TOTAL)

# ============================================================
# S13 封底
# ============================================================
s = new_slide(); bg(s)
glowdot = dot(s, Inches(6.07), Inches(3.15), Inches(1.2), CYAN)
set_alpha(glowdot, 88)
deco_radar(s, Emu(int(Inches(6.67))), Emu(int(Inches(3.75))),
           [(Inches(1.2), 50), (Inches(2.2), 64), (Inches(3.3), 78)])
core = dot(s, Inches(6.52), Inches(3.6), Inches(0.3), GREEN)
set_glow(core, '10B981', opacity=80, blur_in=0.1)
txt(s, Inches(1.5), Inches(2.2), Inches(10.33), Inches(0.4),
    "SMART FOREST · SAFER FUTURE", size=13, color=CYAN, bold=True, align=PP_ALIGN.CENTER, font=MONO)
txt(s, Inches(1.5), Inches(2.65), Inches(10.33), Inches(0.9),
    "守护绿水青山，从每一亩感知开始", size=36, bold=True, align=PP_ALIGN.CENTER)
ul = grad_rect(s, Inches(5.42), Inches(3.66), Inches(2.5), Inches(0.045),
               [(0, '06B6D4'), (1, '10B981')], angle=0)
set_glow(ul, '06B6D4', opacity=65, blur_in=0.06)
txt(s, Inches(1.5), Inches(3.9), Inches(10.33), Inches(0.4),
    "林智森林智能监控平台 —— 让森林防火从被动响应，走向主动防控",
    size=14, color=SUB, align=PP_ALIGN.CENTER)

# 品牌
txt(s, Inches(1.5), Inches(4.78), Inches(10.33), Inches(0.4),
    "林智 LINZHI · 森林智能监控平台 V1.0", size=15, bold=True, align=PP_ALIGN.CENTER)
txt(s, Inches(1.5), Inches(5.2), Inches(10.33), Inches(0.28),
    "SMART FOREST MONITORING PLATFORM · 2026", size=9, color=SUB,
    align=PP_ALIGN.CENTER, font=MONO)

# 联系胶囊
acts = [("产品咨询", "PRESALES", BLUE), ("方案演示", "DEMO", GREEN), ("试点合作", "PILOT", AMBER)]
for i, (a, b, c) in enumerate(acts):
    x = Inches(3.64 + i * 2.1)
    pill = rect(s, x, Inches(5.72), Inches(1.85), Inches(0.72), fill=CARD, line=BORDER2,
                shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.5)
    _apply_grad(pill, [(0, C_T), (1, C_B)], angle=90)
    rect(s, x, Inches(5.72), Inches(1.85), Inches(0.035), fill=c, line=None)
    txt(s, x, Inches(5.86), Inches(1.85), Inches(0.3), a, size=13, bold=True, align=PP_ALIGN.CENTER)
    txt(s, x, Inches(6.2), Inches(1.85), Inches(0.22), b, size=8, color=c,
        align=PP_ALIGN.CENTER, font=MONO)

# 保存
out = r"D:\pythonDev\smartforest\docs\林智森林智能监控平台-产品介绍.pptx"
prs.save(out)
print("OK:", out, "| slides:", len(prs.slides.__iter__.__self__._sldIdLst))
