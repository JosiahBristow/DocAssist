# -*- coding: utf-8 -*-
"""生成《文献助手 · 评审汇报》PPT —— docassist/docs/文献助手-评审汇报.pptx"""
import os, datetime
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', '文献助手-评审汇报.pptx')

NAVY   = RGBColor(0x0E, 0x1B, 0x33)
NAVY2  = RGBColor(0x17, 0x27, 0x4C)
CARD   = RGBColor(0x1C, 0x2C, 0x52)
WHITE  = RGBColor(0xFF, 0xFF, 0xFF)
SOFT   = RGBColor(0xC3, 0xCE, 0xE6)
ACCENT = RGBColor(0x4C, 0x8D, 0xFF)
GREEN  = RGBColor(0x3D, 0xD5, 0x98)
AMBER  = RGBColor(0xFF, 0xC2, 0x6B)
RED    = RGBColor(0xFF, 0x7A, 0x7A)
FONT   = '微软雅黑'

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]
W, H = 13.333, 7.5


def _ea(run, color, size, bold=False, font=FONT):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        from lxml import etree
        ea = etree.SubElement(rPr, qn('a:ea'))
    ea.set('typeface', font)


def slide(bg=NAVY):
    s = prs.slides.add_slide(BLANK)
    rect = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    rect.fill.solid(); rect.fill.fore_color.rgb = bg
    rect.line.fill.background(); rect.shadow.inherit = False
    return s


def box(s, x, y, w, h, fill=CARD, radius=0.12, line=None):
    shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    if line:
        shp.line.color.rgb = line; shp.line.width = Pt(1.2)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    try:
        shp.adjustments[0] = radius
    except Exception:
        pass
    return shp


def text(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.15, space_after=4):
    """runs: list of (text, size, color, bold) or list of ('\n') separators"""
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    first = True
    for item in runs:
        if item == '\n':
            p = tf.add_paragraph()
            first = False
            continue
        txt, size, color, bold = item
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(space_after)
        r = p.add_run(); r.text = txt
        _ea(r, color, size, bold)
    return tb


def page_no(s, n, total=12):
    text(s, 11.6, 6.85, 1.4, 0.35, [(f'{n:02d} / {total}', 10, SOFT, False)], align=PP_ALIGN.RIGHT)


def header(s, kicker, title, n):
    text(s, 0.85, 0.62, 11.6, 0.32, [(kicker, 12, ACCENT, True)])
    text(s, 0.85, 0.95, 11.6, 0.62, [(title, 30, WHITE, True)])
    page_no(s, n)


def chip(s, x, y, w, label, color=ACCENT):
    shp = box(s, x, y, w, 0.34, RGBColor(0x22, 0x33, 0x5C), 0.5)
    tf = shp.text_frame; tf.margin_left = tf.margin_right = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = label
    _ea(r, color, 10.5, True)


# ================= 1 封面 =================
s = slide()
bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.28), prs.slide_height)
bar.fill.solid(); bar.fill.fore_color.rgb = ACCENT; bar.line.fill.background(); bar.shadow.inherit = False

text(s, 0.95, 1.55, 8.4, 0.4, [('AI 应用创新大赛 · 校园学习类 · 文献资料助手', 14, ACCENT, True)])
text(s, 0.95, 1.98, 8.6, 1.2, [('文献助手', 58, WHITE, True)])
text(s, 0.95, 3.05, 8.6, 0.7, [('DocAssist · AI 赋能校园文献阅读与写作', 22, SOFT, False)])
text(s, 0.95, 3.95, 9.0, 1.1, [
    ('论文速读 + 参考文献格式校对 + 学术翻译，一个手机入口全解决。', 15, WHITE, False), '\n',
    ('微信小程序 + Android 客户端（双端同源）· 规则引擎与生成式模型混合架构', 13, SOFT, False)])
box(s, 0.95, 5.35, 5.4, 1.2, CARD, 0.1)
text(s, 1.2, 5.52, 5.0, 0.95, [('团队：（请填写成员姓名，1–3 人）', 12.5, WHITE, False), '\n',
                              ('2026 年 10 月 · 提交日期：10 月 30 日', 11, SOFT, False), '\n',
                              ('Android 客户端已打包：文献助手-1.0.0.apk（4.4 MB，Android 5.1+）', 10.5, ACCENT, False)])
text(s, 11.6, 6.85, 1.2, 0.35, [('01 / 12', 10, SOFT, False)], align=PP_ALIGN.RIGHT)

# ================= 2 痛点 =================
s = slide()
header(s, '需求背景', '校园里两个反复出现的痛点', 2)

kpis = [('40–60 分钟', '通读一篇 12 页英文论文所需时间\n学生真正需要的只是其中 3 个结论', AMBER),
        ('47.7%', '本班 10 份课程论文、86 条文献中\n41 条不符合 GB/T 7714-2015', RED),
        ('4.1 条/份', '平均每份文献表需要手工修改的条数\n格式退回是课程论文最常见的返工原因', ACCENT)]
x = 0.85
for big, desc, col in kpis:
    box(s, x, 1.85, 3.72, 2.05, CARD, 0.1)
    text(s, x + 0.32, 2.08, 3.1, 0.6, [(big, 30, col, True)])
    text(s, x + 0.32, 2.74, 3.1, 1.15, [(desc, 11.5, SOFT, False)], spacing=1.25)
    x += 3.95

box(s, 0.85, 4.25, 11.63, 2.05, NAVY2, 0.08)
text(s, 1.15, 4.5, 6.6, 0.4, [('为什么现有工具补不上这一环', 14, ACCENT, True)])
text(s, 1.15, 4.92, 6.4, 1.2, [
    ('通用 AI 对话：要手工复制粘贴，读不了 PDF，结果不成结构', 12.5, WHITE, False), '\n',
    ('文献管理软件：需付费、桌面端为主，格式规则仍要自己学', 12.5, WHITE, False), '\n',
    ('校园场景：文献阅读发生在通勤、课间、宿舍——不在电脑前', 12.5, WHITE, False)], spacing=1.35)
text(s, 7.9, 4.5, 4.3, 1.6, [
    ('需求判断', 12, ACCENT, True), '\n',
    ('手机可用、零注册；读与写连起来；结果可核对、可复现', 12, SOFT, False)], spacing=1.4)

# ================= 3 作品概览 =================
s = slide()
header(s, '作品概述', '三条主线，一个入口', 3)

lines = [('论文速读', '选择 PDF → 10–30 秒', ['一句话读懂', '研究问题 / 方法 / 数据', '结论 / 创新 / 局限', '术语对照表'], ACCENT),
         ('格式校对', '粘贴整段 → 1 秒内', ['18 条国标规则逐条判定', '外文文献自动转国标', '一键修正', '导出文献表 / BibTeX'], GREEN),
         ('学术翻译', '粘贴段落 → 5–20 秒', ['先抽术语表', '术语约束逐段翻译', '双语对照', '保留公式与编号'], AMBER)]
x = 0.85
for name, sub, items, col in lines:
    box(s, x, 1.8, 3.72, 3.85, CARD, 0.09)
    chip(s, x + 0.3, 2.0, 1.9, name, col)
    text(s, x + 0.3, 2.52, 3.1, 0.3, [(sub, 11, SOFT, False)])
    yy = 2.95
    for it in items:
        text(s, x + 0.3, yy, 3.15, 0.35, [('· ' + it, 12.5, WHITE, False)])
        yy += 0.42
    x += 3.95

box(s, 0.85, 5.88, 11.63, 0.95, NAVY2, 0.08)
text(s, 1.15, 6.05, 11.1, 0.7, [
    ('形态：微信小程序 + Android 客户端（APK）双端同源　|　扫码即用、无需注册　|　格式校对零门槛、断网可用　|　AI 由用户自持密钥（BYOK）驱动', 11.5, SOFT, False)])

# ================= 4 论文速读 =================
s = slide()
header(s, '功能一', '论文速读：把 12 页论文压成一张能看懂的卡', 4)

box(s, 0.85, 1.8, 6.6, 4.9, CARD, 0.07)
text(s, 1.15, 1.98, 2.6, 0.3, [('结构化字段', 12, ACCENT, True)])
fields = [('一句话读懂', '不超过 60 字，说清做了什么、效果如何'),
          ('研究问题', '它要解决什么，缺口在哪'),
          ('方法与技术路线', '用了什么模型 / 算法 / 流程'),
          ('数据与实验', '数据集、样本量、对比基线；未说明就写"未说明"'),
          ('主要结论', '尽量带数字，便于直接引用'),
          ('创新点 / 局限', '写作时可借用的"研究空白"'),
          ('术语对照表', '英文术语—中文译名—一句话解释'),
          ('参考文献段落', '自动抽取，直接进入格式校对')]
yy = 2.36
for k, v in fields:
    text(s, 1.15, yy, 1.75, 0.3, [(k, 11.5, WHITE, True)])
    text(s, 2.95, yy, 4.3, 0.3, [(v, 10.5, SOFT, False)])
    yy += 0.52

box(s, 7.75, 1.8, 4.72, 2.6, NAVY2, 0.07)
text(s, 8.0, 1.98, 4.2, 0.3, [('工程细节', 12, ACCENT, True)])
text(s, 8.0, 2.36, 4.25, 1.9, [
    ('> 1.2 万字自动 Map-Reduce：', 11.5, WHITE, True), '\n',
    ('先分块提炼要点再汇总，绕开上下文限制', 10.5, SOFT, False), '\n',
    ('扫描版识别：', 11.5, WHITE, True), '\n',
    ('文本层过少直接提示，不拿空文本硬喂模型', 10.5, SOFT, False)], spacing=1.3, space_after=2)

box(s, 7.75, 4.6, 4.72, 2.1, NAVY2, 0.07)
text(s, 8.0, 4.78, 4.2, 0.3, [('输出约束', 12, ACCENT, True)])
text(s, 8.0, 5.14, 4.25, 1.4, [
    ('· JSON 结构化输出，固定字段可直接渲染', 10.5, SOFT, False), '\n',
    ('· 只依据原文、不编造数据、缺失填"未说明"', 10.5, SOFT, False), '\n',
    ('· temperature 0.2，同一篇论文结果稳定', 10.5, SOFT, False)], spacing=1.3, space_after=2)

# ================= 5 格式校对（真实截图） =================
s = slide()
header(s, '功能二', '参考文献格式校对：18 条国标规则，秒级判定', 5)

img = os.path.join(ROOT, 'docs', 'img', 'app-cite.png')
if os.path.exists(img):
    iw, ih = Image.open(img).size
    h_in = 5.25
    w_in = h_in * iw / ih
    s.shapes.add_picture(img, Inches(0.85), Inches(1.72), Inches(w_in), Inches(h_in))
    text(s, 0.85, 7.05, 3.4, 0.3, [('Android 客户端实机界面（与小程序同源）', 9, SOFT, False)])
else:
    p = '缺少截图 docs/img/app-cite.png'

rt_x = 0.85 + (5.25 * 860 / 1800) + 0.55
box(s, rt_x, 1.72, W - rt_x - 0.85, 2.55, CARD, 0.07)
text(s, rt_x + 0.28, 1.9, W - rt_x - 1.4, 0.3, [('判定分级与计分', 12.5, ACCENT, True)])
text(s, rt_x + 0.28, 2.28, W - rt_x - 1.45, 1.9, [
    ('错误 / 警告 / 提示 三级', 11.5, WHITE, True), '\n',
    ('100 − 20×错误 − 8×警告 − 2×提示（下限 0）', 11, SOFT, False), '\n',
    ('一键修正可处理：标点、页码符号、作者"等"、引用日期', 11, SOFT, False)], spacing=1.35, space_after=3)

box(s, rt_x, 4.42, W - rt_x - 0.85, 2.55, CARD, 0.07)
text(s, rt_x + 0.28, 4.6, W - rt_x - 1.4, 0.3, [('规则覆盖面（部分）', 12.5, ACCENT, True)])
rules = ['类型标识缺失 / 题名前多空格', '作者 >3 人未用"等 / et al."',
         '期刊缺卷(期)、缺页码', '专著缺出版地、学位论文缺保存单位',
         '电子资源缺引用日期 / URL', '页码用 ~ 或长破折号',
         '外文 ACL / IEEE 体例 → 一键转国标', '重复条目检测、导出文献表 / BibTeX']
yy = 4.98
for r in rules:
    text(s, rt_x + 0.28, yy, W - rt_x - 1.45, 0.26, [('· ' + r, 10.5, SOFT, False)])
    yy += 0.245

# ================= 6 闭环 =================
s = slide()
header(s, '创新点 ①', 'PDF → 参考文献 → 一键校对：把最痛的一步自动化', 6)

steps = [('① 上传 PDF', '有文字层的论文\n（知网 / arXiv / IEEE）'),
         ('② 自动定位', '全文搜索最后一个\n"参考文献 / References"'),
         ('③ 规则切分', '按 [n] / n. 编号切条\n去编号、去短行、不动原文'),
         ('④ 一键校对', '18 条规则判定\n一键修正、导出文献表')]
x = 0.85
for i, (t, d) in enumerate(steps):
    box(s, x, 2.0, 2.72, 2.35, CARD, 0.1)
    text(s, x + 0.26, 2.2, 2.3, 0.35, [(t, 14, ACCENT if i < 3 else GREEN, True)])
    text(s, x + 0.26, 2.66, 2.28, 1.4, [(d, 11, SOFT, False)], spacing=1.35)
    if i < 3:
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + 2.78), Inches(2.95), Inches(0.32), Inches(0.42))
        ar.fill.solid(); ar.fill.fore_color.rgb = ACCENT; ar.line.fill.background(); ar.shadow.inherit = False
    x += 3.12

box(s, 0.85, 4.6, 11.63, 1.9, NAVY2, 0.07)
text(s, 1.15, 4.82, 5.4, 0.35, [('学生写文献表的真实动作', 12.5, ACCENT, True)])
text(s, 1.15, 5.2, 5.3, 1.15, [
    ('读一篇文献 → 记下题名、作者、期刊 → 抄进文献表 → 对照国标逐条改 → 再查一遍', 11.5, SOFT, False)], spacing=1.4)
text(s, 7.05, 4.82, 5.2, 0.35, [('本作品', 12.5, GREEN, True)])
text(s, 7.05, 5.2, 5.2, 1.15, [
    ('读一篇文献 → 勾选"检查这篇论文的参考文献" → 一键修正 → 复制文献表', 11.5, WHITE, False)], spacing=1.4)

text(s, 0.85, 6.68, 11.6, 0.3, [('英文论文的参考文献是 ACL 体例（年份在末尾、作者用 and 连接），抽取后自动识别并重写为国标——这是闭环能成立的前提', 10.5, SOFT, False)])

# ================= 7 架构 =================
s = slide()
header(s, '技术实现', '分层架构：小程序 + 云函数 + 混合能力层', 7)

layers = [('表现层', '小程序 5 页（含 API 设置）｜Android 客户端（同一份前端资源）', '交互、状态、本地统计', ACCENT),
          ('服务层', '小程序：云函数 docai｜Android：本机 pdf.js + 原生 HTTP 直连模型', '分发、超时、错误码', RGBColor(0x7E, 0xB6, 0xFF)),
          ('能力层', 'pdf-parse　|　规则引擎 gb7714.js（18 条）　|　DeepSeek API', '解析 · 判定 · 生成', GREEN),
          ('数据层', '云存储（私有路径 PDF）| 云数据库（仅元数据）| 本地 storage（统计 + 用户密钥）', '密钥不出本机', AMBER)]
y = 1.78
for name, mid, right, col in layers:
    box(s, 0.85, y, 11.63, 1.0, CARD, 0.07)
    text(s, 1.15, y + 0.3, 1.4, 0.35, [(name, 13, col, True)])
    text(s, 2.55, y + 0.28, 6.9, 0.5, [(mid, 11.5, WHITE, False)])
    text(s, 9.75, y + 0.3, 2.5, 0.35, [(right, 10.5, SOFT, False)])
    y += 1.14

box(s, 0.85, 5.45, 5.65, 1.35, NAVY2, 0.08)
text(s, 1.1, 5.62, 5.1, 1.0, [('云开发带来的交付优势', 11.5, ACCENT, True), '\n',
                             ('无需自建服务器、无需 ICP 备案域名；扫码即体验', 10.5, SOFT, False)], spacing=1.3, space_after=2)
box(s, 6.83, 5.45, 5.65, 1.35, NAVY2, 0.08)
text(s, 7.08, 5.62, 5.1, 1.0, [('单一事实来源', 11.5, ACCENT, True), '\n',
                              ('shared/ 同步到两端，避免小程序与云函数逻辑漂移', 10.5, SOFT, False)], spacing=1.3, space_after=2)

# ================= 8 AI 模块 =================
s = slide()
header(s, '核心 AI 模块', '模型只做"读不懂"的部分，其余交给确定性规则', 8)

cols = [('结构化速读', ACCENT, [
            '角色设定：严谨的学术阅读助手',
            '三条硬约束：只依原文 / 不编造 / 缺失填"未说明"',
            '固定 JSON schema，11 个字段',
            'temperature 0.2，max_tokens 2200',
            '长文 Map-Reduce：每块 ≤120 字要点']),
        ('术语一致翻译', GREEN, [
            '第一步：抽 12–20 个术语建表',
            '第二步：术语表作为强约束逐段注入',
            '保留公式、数字、参考文献编号',
            '分段 2200 字，避免译文被截断',
            '解决通用机翻的"术语漂移"']),
        ('规则引擎（非 AI）', AMBER, [
            '18 条规则，三级判定',
            '每条规则自带修正器',
            '毫秒级、断网可用、结果可复现',
            '模型故障时校对能力完好',
            '只对国标明确项报错，避免误报'])]
x = 0.85
for name, col, items in cols:
    box(s, x, 1.8, 3.72, 3.6, CARD, 0.08)
    text(s, x + 0.28, 1.98, 3.2, 0.35, [(name, 14, col, True)])
    yy = 2.45
    for it in items:
        text(s, x + 0.28, yy, 3.15, 0.5, [('· ' + it, 10.5, SOFT, False)], spacing=1.25)
        yy += 0.55
    x += 3.95

box(s, 0.85, 5.62, 11.63, 1.15, NAVY2, 0.08)
text(s, 1.15, 5.8, 11.1, 0.85, [
    ('选型理由：DeepSeek-Chat 支持 64K 上下文与 JSON 模式，境内服务、数据不出境，单篇速读成本 0.01–0.03 元；'
     '不做微调——周期内无高质量标注数据，把投入放在提示词结构与失败兜底上', 11, SOFT, False)], spacing=1.35)

# ================= 9 创新点 =================
s = slide()
header(s, '创新创意', '四个可验证的差异点', 9)

items = [('混合架构', '确定性的交给规则，语义的交给模型',
          '校对断网可用、同一输入输出恒定、模型故障不影响核心能力', ACCENT),
         ('读写闭环', '抽出参考文献段，外文体例自动转国标',
          '《Attention》全文 38 条参考文献零误判转换，直接从英文论文产出可用文献表', GREEN),
         ('术语先对齐', '先建术语表再翻译',
          '把术语一致性从随机行为变成显式约束', AMBER),
         ('场景取舍', '零安装、手机优先、失败可解释',
          '扫描版 / 网络 / 解析失败分别给出下一步动作', RGBColor(0xB9, 0x9CFF & 0xFF, 0xFF) if False else RGBColor(0xC0, 0x8C, 0xFF))]
y = 1.8
for i, (name, line, why, col) in enumerate(items):
    box(s, 0.85, y, 11.63, 1.12, CARD, 0.07)
    text(s, 1.15, y + 0.2, 0.7, 0.4, [(f'0{i+1}', 16, col, True)])
    text(s, 1.95, y + 0.18, 2.3, 0.35, [(name, 13, WHITE, True)])
    text(s, 1.95, y + 0.62, 3.0, 0.35, [(line, 10.5, SOFT, False)])
    text(s, 5.25, y + 0.38, 7.0, 0.5, [(why, 11.5, col, False)])
    y += 1.24

# ================= 10 落地 =================
s = slide()
header(s, '校园落地', '从本班 10 份文献表到 2 个班的试用', 10)

box(s, 0.85, 1.8, 7.3, 4.7, CARD, 0.06)
rows = [('阶段', '对象 / 规模', '观察指标'),
        ('已完成自测', '8 组典型样例 + 119 页 PDF 解析', '判定与修正逐条核对'),
        ('内测（本周）', '团队 + 同班 5 人 / 10 份文献表', '平均修正条数、修正后通过率'),
        ('试用（11 月上旬）', '论文写作课 1–2 个班 / 约 60 人', '周活跃、速读篇数、"能看懂"1–5 分'),
        ('推广（11 月中下旬）', '学院公众号 / 课程群 / 图书馆', '新增用户、复用率')]
yy = 2.02
for i, (a, b, c) in enumerate(rows):
    col = ACCENT if i == 0 else WHITE
    text(s, 1.12, yy, 1.75, 0.3, [(a, 11 if i else 10.5, col, i == 0 or i == 1)])
    text(s, 2.95, yy, 2.7, 0.5, [(b, 10, SOFT, False)], spacing=1.2)
    text(s, 5.72, yy, 2.3, 0.5, [(c, 10, SOFT, False)], spacing=1.2)
    if i:
        ln = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.12), Inches(yy - 0.14), Inches(6.85), Emu(9525))
        ln.fill.solid(); ln.fill.fore_color.rgb = RGBColor(0x2C, 0x3D, 0x66); ln.line.fill.background()
    yy += 0.86

box(s, 8.35, 1.8, 4.12, 2.2, NAVY2, 0.08)
text(s, 8.6, 1.98, 3.6, 0.3, [('可持续性', 12.5, GREEN, True)])
text(s, 8.6, 2.36, 3.65, 1.5, [
    ('云开发免费额度可支撑小规模日常使用', 10.5, SOFT, False), '\n',
    ('校对功能零 token 成本', 10.5, SOFT, False), '\n',
    ('后续可接校内统一认证与图书馆资源', 10.5, SOFT, False)], spacing=1.3, space_after=2)

box(s, 8.35, 4.2, 4.12, 2.3, NAVY2, 0.08)
text(s, 8.6, 4.38, 3.6, 0.3, [('数据与隐私', 12.5, ACCENT, True)])
text(s, 8.6, 4.76, 3.65, 1.6, [
    ('仅处理用户主动选择的文件', 10.5, SOFT, False), '\n',
    ('云数据库只存标题/页数/字数等元数据', 10.5, SOFT, False), '\n',
    ('BYOK：密钥只存用户本机，云函数内存转发不落库', 10.5, SOFT, False), '\n',
    ('仅用境内模型服务，数据不出境', 10.5, SOFT, False)], spacing=1.28, space_after=2)

# ================= 11 限制 =================
s = slide()
header(s, '坦诚说明', '已知限制与下一步迭代', 11)

left = [('不支持扫描版 PDF', '已识别并明确提示，不拿空文本硬喂模型', '接入 OCR 或引导使用文字版'),
        ('超长论文摘要损失细节', '每段仅保留 120 字要点', '改为分层摘要（章节级 → 全文级）'),
        ('暂无文献库管理', '仅单次校验与导出，不跨稿保存', '收藏 / 标签 + Zotero·EndNote 导出')]
right = [('规则不覆盖期刊内部细则', '如作者姓名缩写形式，不做判定', '支持自定义期刊模板'),
         ('AI 功能需用户自备密钥', '格式校对无需密钥，设置页 30 秒引导', '争取课程共用额度 / 校内统一网关'),
         ('暂无文献问答（RAG）', '只做摘要与翻译，不支持追问', '复用已解析文本做“针对本文提问”')]

ROW_H, GAP = 1.32, 1.44
for col, items, x, accent in ((0, left, 0.85, RED), (1, right, 6.83, AMBER)):
    y = 1.72
    for (a, b, c) in items:
        box(s, x, y, 5.65, ROW_H, CARD, 0.08)
        text(s, x + 0.27, y + 0.15, 5.1, 0.32, [(a, 12, accent, True)])
        text(s, x + 0.27, y + 0.5, 5.1, 0.3, [(b, 10, SOFT, False)])
        text(s, x + 0.27, y + 0.9, 5.1, 0.3, [(c, 10.5, GREEN, False)])
        y += GAP

box(s, 0.85, 6.05, 11.63, 0.68, NAVY2, 0.08)
text(s, 1.12, 6.18, 11.1, 0.45, [('以上限制均已写入说明书第十一章并给出对应迭代计划；下一阶段优先做「针对这篇论文提问」（RAG）', 10.5, SOFT, False)])

# ================= 12 收尾 =================
s = slide()
text(s, 0.95, 2.0, 8.0, 0.4, [('谢谢 · 欢迎提问', 14, ACCENT, True)])
text(s, 0.95, 2.45, 9.5, 0.9, [('文献助手 DocAssist', 40, WHITE, True)])
text(s, 0.95, 3.35, 10.6, 1.9, [
    ('作品形态：微信小程序体验版（扫码即用）+ Android 客户端（APK 安装）', 13, SOFT, False), '\n',
    ('双端同源：miniprogram / app-android / shared / cloudfunctions / local-preview / test', 13, SOFT, False), '\n',
    ('可复现：规则引擎 8 组回归样例；外文转换 38/38；本地预览 npm run preview', 13, SOFT, False)], spacing=1.5, space_after=3)
box(s, 0.95, 5.05, 5.6, 1.0, CARD, 0.1)
text(s, 1.2, 5.22, 5.1, 0.7, [('团队：（请填写）　负责人：（请填写）', 12, WHITE, False), '\n',
                              ('联系方式：（请填写）', 11, SOFT, False)])
text(s, 11.6, 6.85, 1.2, 0.35, [('12 / 12', 10, SOFT, False)], align=PP_ALIGN.RIGHT)

prs.save(OUT)
print('saved', OUT, os.path.getsize(OUT), 'bytes', len(prs.slides.__iter__.__self__._sldIdLst), 'slides')
