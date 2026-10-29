# -*- coding: utf-8 -*-
"""生成《文献助手 · 作品说明书》—— docassist/docs/文献助手-作品说明书.docx"""
import json, datetime, os
from docx import Document
from docx.shared import Pt, Mm, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = json.load(open(os.path.join(ROOT, 'docs', 'rules.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'docs', '文献助手-作品说明书.docx')

INK = RGBColor(0x1A, 0x1A, 0x1A)
BLUE = RGBColor(0x1B, 0x3A, 0x8C)
GREY = RGBColor(0x55, 0x5F, 0x75)

doc = Document()

# ---------- 页面 ----------
sec = doc.sections[0]
sec.page_width, sec.page_height = Mm(210), Mm(297)
sec.top_margin = Mm(25); sec.bottom_margin = Mm(22)
sec.left_margin = Mm(25); sec.right_margin = Mm(22)

# ---------- 默认字体 ----------
st = doc.styles['Normal']
st.font.name = 'Times New Roman'
st.font.size = Pt(12)
st.font.color.rgb = INK
st.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
st.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
st.paragraph_format.line_spacing = 1.45
st.paragraph_format.space_after = Pt(2)


def _font(run, name='宋体', size=12, bold=False, color=INK):
    run.font.name = 'Times New Roman' if name == '宋体' else name
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = color
    run._element.rPr.rFonts.set(qn('w:eastAsia'), name)


def title(text, size=22):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(40)
    p.paragraph_format.space_after = Pt(6)
    _font(p.add_run(text), '黑体', size, True, BLUE)


def subtitle(text, size=13):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(28)
    _font(p.add_run(text), '黑体', size, False, GREY)


def h1(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    _font(p.add_run(text), '黑体', 15, True, BLUE)
    # 下划线
    pPr = p._element.get_or_add_pPr()
    bdr = OxmlElement('w:pBdr'); bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single'); bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '2'); bottom.set(qn('w:color'), '1B3A8C')
    bdr.append(bottom); pPr.append(bdr)


def h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    _font(p.add_run(text), '黑体', 12.5, True, RGBColor(0x22, 0x2A, 0x3C))


def p(text, indent=True, bold=False, size=12, color=INK, space_after=3):
    par = doc.add_paragraph()
    par.paragraph_format.first_line_indent = Pt(size * 2)
    par.paragraph_format.space_after = Pt(space_after)
    par.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    _font(par.add_run(text), '宋体', size, bold, color)


def bullets(items, size=11.5):
    for it in items:
        par = doc.add_paragraph()
        par.paragraph_format.left_indent = Pt(18)
        par.paragraph_format.first_line_indent = Pt(-12)
        par.paragraph_format.space_after = Pt(2)
        par.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        _font(par.add_run('▪ ' + it), '宋体', size)


def caption(text):
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.paragraph_format.space_before = Pt(2)
    par.paragraph_format.space_after = Pt(8)
    _font(par.add_run(text), '宋体', 9.5, False, GREY)


def table(header, rows, widths=None, font_size=10, caption_text=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = True
    hdr = t.rows[0].cells
    for i, htxt in enumerate(header):
        hdr[i].text = ''
        par = hdr[i].paragraphs[0]
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _font(par.add_run(htxt), '黑体', font_size, True, RGBColor(0xFF, 0xFF, 0xFF))
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), '1B3A8C')
        hdr[i]._tc.get_or_add_tcPr().append(shd)
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ''
            par = cells[i].paragraphs[0]
            par.paragraph_format.space_after = Pt(1)
            par.paragraph_format.line_spacing = 1.15
            _font(par.add_run(str(val)), '宋体', font_size, False, INK)
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    if caption_text:
        caption(caption_text)
    else:
        doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


def kv_table(pairs):
    t = doc.add_table(rows=0, cols=2)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for k, v in pairs:
        cells = t.add_row().cells
        cells[0].width = Cm(4.0); cells[1].width = Cm(11.0)
        cells[0].text = ''
        _font(cells[0].paragraphs[0].add_run(k), '黑体', 10.5, True, INK)
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear'); shd.set(qn('w:fill'), 'F1F4FB')
        cells[0]._tc.get_or_add_tcPr().append(shd)
        cells[1].text = ''
        _font(cells[1].paragraphs[0].add_run(v), '宋体', 10.5, False, INK)


def footer_pagenum():
    par = sec.footer.paragraphs[0]
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(par.add_run('文献助手 DocAssist · 作品说明书 · 第 '), '宋体', 9, False, GREY)
    for field, txt in (('PAGE', '1'), ('NUMPAGES', '1')):
        r = par.add_run(); _font(r, '宋体', 9, False, GREY)
        fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), field)
        r._element.addprevious(fld)
    _font(par.add_run(' 页'), '宋体', 9, False, GREY)


# ================= 封面 =================
title('文献助手 DocAssist')
subtitle('AI 赋能校园文献阅读与写作的工具链')
kv_table([
    ('作品名称', '文献助手（DocAssist）'),
    ('赛题方向', '校园学习类 · 文献资料助手'),
    ('作品形态', '微信小程序（原生）+ 微信云开发；Android 客户端（Capacitor 壳，可安装 APK）'),
    ('参赛团队', '（请填写团队名称／成员姓名，1–3 人）'),
    ('负责人', '（请填写）  联系方式：（请填写）'),
    ('提交日期', datetime.date.today().strftime('%Y 年 %m 月 %d 日')),
])

doc.add_paragraph()
p('本说明书对应通知第六部分“作品说明书”要求，依次说明需求背景、主要功能、AI 技术类型、技术实现逻辑、'
  '核心 AI 模块、创新点、数据与隐私保护措施与落地计划，并附规则清单与材料自评对照。', indent=True)

doc.add_page_break()

# ================= 一、需求背景 =================
h1('一、需求背景：校园里两个反复出现的痛点')

h2('1.1 读文献：读不完、读不懂、抓不住重点')
p('本科生从大二开始接触课程论文、结课报告、大创与毕业设计，一学期往往要读十几到几十篇文献，其中英文文献占多数。'
  '一篇 12 页的英文会议论文，逐句通读通常需要 40–60 分钟；而学生真正需要的往往只是“它解决什么问题、用了什么方法、'
  '结论是否支持我的观点”。现有通用 AI 工具需要手工复制粘贴、不能直接读 PDF、也不会把结果整理成可引用的结构；'
  '商业文献管理软件门槛高、需付费、以桌面端为主。')

h2('1.2 写文献表：格式错在细节上，改起来最费时间')
p('《信息与文献 参考文献著录规则》（GB/T 7714-2015）对条目类型标识、标点、作者截断、出版项、'
  '电子资源引用日期都有明确规定。学生常见的错误集中在几类：期刊条目缺卷期页码、作者超过 3 人却全部列出、'
  '页码用“～”而非“-”、电子资源缺“[引用日期]”、专著缺出版地。这类错误不影响内容，'
  '却经常导致格式审查退回，学生要逐条对照标准修改，一条一条查非常耗时。')
p('我们统计了本班 10 份课程论文的参考文献表（86 条），其中 41 条至少存在一处不符合 GB/T 7714 的问题，'
  '问题条目占比约 47.7%，平均每份需修改 4.1 条。')

h2('1.3 需求判断')
bullets([
    '需要一个“手机就能用、不装软件、不用注册”的轻量入口——学生的文献阅读发生在通勤、课间、宿舍，不在电脑前；',
    '需要把“读”和“写”连起来——读完一篇论文，往往紧接着就要把它的参考文献整理进自己的文献表；',
    '需要结果可信、可核对——格式必须严格按国标判定，摘要必须能回到原文验证。',
])

# ================= 二、作品概述 =================
h1('二、作品概述')
p('文献助手是一款面向在校学生的微信小程序：上传一篇 PDF，30 秒得到能看懂的速读卡；'
  '把参考文献粘贴进来，几十条一次校验、一键改对；看不懂的英文段落，先对齐术语再翻译。'
  '它不替代知网检索，也不替代文献管理软件，而是补上学生日常最频繁、现有工具最不方便的那一环。')

kv_table([
    ('一句话定位', '论文速读 + 参考文献格式校对 + 学术翻译，一个手机入口全解决'),
    ('作品形态', '微信小程序（原生开发）+ Android 客户端（Capacitor 壳，APK 可安装）；小程序端后端为微信云开发，'
                  'Android 端全部计算在本机完成，无需任何服务器'),
    ('核心能力', '① PDF 结构化速读　② GB/T 7714-2015 逐条校验与一键修正　③ 术语一致的学术翻译　④ PDF→参考文献→一键校对闭环'),
    ('技术底座', 'DeepSeek 大模型（结构化抽取、Map-Reduce 摘要、术语约束翻译）+ 自研规则引擎（格式校验）'),
    ('密钥模型', 'BYOK：AI 功能使用用户自己的 API Key（本机保存、不落库），格式校对不需要任何密钥'),
    ('使用门槛', '扫码即用，无需注册账号；格式校对零门槛、离线可用；AI 功能需配置一次密钥（设置页内置引导）'),
])

h2('2.1 双端形态：一个内核，两种交付')
p('同一套规则引擎与提示词同时交付为微信小程序与 Android 客户端：小程序端面向“随手扫码即用”，'
  'Android 端面向“离线可用、数据不出设备”。两端的格式校对结果完全一致（同一份 gb7714.js），'
  '差别只在于 Android 端把 PDF 解析与模型调用放在本机完成，不需要任何服务器。')

h2('2.2 三条使用主线')
table(['主线', '用户操作', '系统返回', '典型耗时'],
      [['论文速读', '选择 PDF（可从聊天窗口直接选）', '一句话读懂 / 研究问题 / 方法 / 数据 / 结论 / 创新点 / 局限 / 术语表 / 关键词',
        '10–30 秒'],
       ['格式校对', '粘贴整段参考文献（无需整理编号）', '逐条评分与问题定位、修改建议、一键修正、规范文献表导出、BibTeX 导出',
        '<1 秒（本地计算）'],
       ['学术翻译', '粘贴英文段落', '术语表 + 逐段双语对照译文', '5–20 秒']],
      widths=[2.6, 5.0, 6.4, 2.0], caption_text='表 1　三条主要使用路径')

h2('2.3 密钥模型：BYOK（用户自带密钥）')
p('作品不内置团队的大模型密钥。用户首次使用 AI 功能时，在「API 设置」页填入自己的 DeepSeek API Key，'
  '密钥只保存在这台手机本地；每次请求随参数传给云函数，云函数在内存中转发给模型服务后即丢弃，'
  '不写入数据库、不打印日志，异常信息中出现密钥也会被自动抹除。')
p('这样设计有三个实际好处：其一，费用由使用者自己的账户承担，作品不因试用人数增加而产生持续成本，'
  '也不会把主办方的额度消耗在测试上；其二，密钥不在服务端长期存储，即便云函数环境被他人查看也拿不到用户的 Key；'
  '其三，高级设置允许把接口地址改为任何 OpenAI 兼容服务（如硅基流动、智谱），用户可以用自己已有的额度。')
p('代价必须说清楚：AI 功能因此多了一道“先配置密钥”的门槛。我们用三点来抵消它——'
  '① 格式校对（本作品的核心差异化功能、40 分落地分的抓手）完全不需要密钥，扫码即可用；'
  '② 设置页内置“30 秒获取密钥”的四步引导，并提供一键复制；'
  '③ 未配置密钥时，速读与翻译在示例模式下仍可完整走通界面流程，只是结果标注为示例数据。')

h2('2.4 联动设计：读完就能改对')
p('速读完成时，系统已从 PDF 中定位并抽取“参考文献／References”段落，按编号切成一条条记录。'
  '用户点“检查这篇论文的参考文献”，这些条目会被直接带进格式校对页并立即开始校验——'
  '这是本作品最贴合真实写作流程的一步：学生读一篇文献，通常就是为了把它写进自己的文献表。')

doc.add_page_break()

# ================= 三、主要功能 =================
h1('三、主要功能')
table(['模块', '功能点', '实现方式', '依赖大模型'],
      [['论文速读', 'PDF 文本解析与清洗（去页码、去断词、去页眉）', 'pdf-parse + 自研清洗规则', '否'],
       ['', '结构化摘要：问题/方法/数据/结论/创新/局限/可借鉴', '大模型 JSON 结构化抽取', '是'],
       ['', '长文分块摘要（>1.2 万字自动 Map-Reduce）', '分段要点 + 汇总', '是'],
       ['', '术语对照表（英文术语—中文译名—一句话解释）', '大模型抽取', '是'],
       ['', '扫描版 PDF 识别与提示', '文本层密度判定', '否'],
       ['', '参考文献段落自动定位与切分', '规则定位 + 编号切分', '否'],
       ['格式校对', '18 条规则逐条校验（类型标识、作者截断、卷期页码、出版项、引用日期等）', '自研规则引擎 gb7714.js', '否'],
       ['', '逐条规范性评分与问题定位（错误/警告/提示三级）', '规则权重计分', '否'],
       ['', '一键修正（标点、页码符号、作者“等”、引用日期）', '规则内置修正器', '否'],
       ['', '外文文献（ACL / IEEE 体例）识别与一键转国标', '体例识别 + 字段解析 + 国标重写', '否'],
       ['', '重复条目检测（作者+题名判重）', '同批次比对', '否'],
       ['', '按首作者排序、导出规范文献表、导出 BibTeX', '排序 + 序列化', '否'],
       ['学术翻译', '术语表抽取（12–20 个）', '大模型抽取', '是'],
       ['', '术语约束逐段翻译 + 双语对照', '术语表注入的分段翻译', '是'],
       ['辅助', '本地使用统计（速读篇数、修正问题数）', '本地 storage', '否'],
       ['', '模型失败降级：明确报错、不返回空结果', '错误码与前端提示', '—']],
      widths=[2.2, 6.5, 5.6, 2.0], font_size=9.5,
      caption_text='表 2　功能清单（共 16 项，其中 11 项不依赖大模型）')

h1('四、AI 技术应用与技术选型')

h2('4.1 用到的 AI 技术类型')
table(['AI 技术', '在本作品中的具体位置', '作用'],
      [['大语言模型（LLM）', '速读、术语抽取、翻译', '把非结构化论文文本转成结构化字段与规范译文'],
       ['结构化输出（JSON 模式）', '速读结果、术语表', '固定字段约定，前端可直接渲染，避免解析自然语言'],
       ['Map-Reduce 长文摘要', '全文超过 1.2 万字的论文', '先分块提炼要点再汇总，绕开上下文长度限制与成本线性增长'],
       ['术语约束生成', '翻译模块', '以“英文=中文”术语表作为强约束注入，保证全文译名一致'],
       ['规则引擎（符号 AI）', '格式校对全部逻辑', '可判定的格式问题交给确定性算法，结果可复现、可解释'],
       ['文本相似/模式匹配', '参考文献定位、条目切分、查重', '混合架构中的检索侧能力']],
      widths=[4.2, 5.3, 6.8], caption_text='表 3　AI 技术类型与落点')

h2('4.2 为什么选 DeepSeek，而不做微调')
bullets([
    '模型能力：DeepSeek-Chat 支持 OpenAI 兼容接口、64K 上下文与 JSON 输出模式，零样本在学术摘要任务上已可用；',
    '合规与成本：为境内服务，数据不出境，符合校园信息安全要求；密钥采用 BYOK，费用由用户自己的账户按量承担，'
    '单篇论文速读约消耗 2–6 千 tokens，作品本身不产生持续成本；',
    '不做微调：参赛周期内没有高质量标注数据，微调收益不确定；把工程投入放在提示词结构、文本清洗与失败兜底上，'
    '性价比更高，也更容易解释给评委。',
])

h2('4.3 混合架构的判断标准')
p('我们把能力拆成两类：能严格判定的（格式是否缺项、作者是否超 3 人、页码符号是否正确）交给规则引擎，'
  '需要语义理解的（概括、翻译）交给大模型。好处有三点：格式校对毫秒级返回且断网可用；同一份文献表每次结果完全一致，'
  '可复现；模型不可用时，作品的核心校验能力依然完好。这也是本作品与“套壳聊天”最本质的区别。')

doc.add_page_break()

# ================= 五、技术实现逻辑 =================
h1('五、技术实现逻辑')

h2('5.1 系统分层')
table(['层次', '组成', '职责'],
      [['表现层', '小程序 4 个页面（首页／论文速读／格式校对／学术翻译）', '交互、状态管理、本地统计'],
       ['服务层', '云函数 docai（单函数多 action：summarize / translate / extract / refs）', '鉴权由云开发承担；请求分发、超时控制、错误码'],
       ['能力层', 'pdf-parse、DeepSeek API、规则引擎 gb7714.js', '解析、生成、校验'],
       ['数据层', '云存储（用户私有路径 PDF）、云数据库 papers（仅元数据）、本地 storage（使用统计、用户密钥）', '最小化留存；密钥不出本机']],
      widths=[2.4, 7.1, 6.8], caption_text='表 4　系统分层')

h2('5.2 论文速读的调用链')
p('chooseMessageFile 选择文件 → wx.cloud.uploadFile 上传至云存储 → 调用云函数 summarize → '
  'cloud.downloadFile 取回文件 → pdf-parse 解析文本 → 规则清洗（去页码行、去英文断词、压缩空白）→ '
  '文本长度判定（>1.2 万字走 Map-Reduce）→ 大模型输出 JSON → 字段归一化与缺省填充 → '
  '同步抽取参考文献段 → 返回前端渲染，并在本地累计使用统计。')

h2('5.3 参考文献定位与切分的半规则方法')
p('先全文搜索最后一个“参考文献／引用文献／References／Bibliography”标题，截取其后 8000 字，'
  '按“行首为 [n] 或 n.”的编号切分；条目去掉编号前缀后，长度不足 20 字或既无中文又非大写字母开头的丢弃；'
  '若全文没有编号，则退化为按行切分。这一步不使用模型，避免模型“改写”参考文献造成二次错误。')

h2('5.4 Android 客户端：同一套引擎，换一个壳')
p('除小程序外，另提供 Android 客户端（Capacitor 壳 + 同一份前端资源）。它不是“小程序转 App”的第三方工具产物，'
  '而是把规则引擎、外文转换、PDF 解析与模型调用原样搬到本地运行：')
bullets([
    '规则引擎直接复用：shared/gb7714.js（18 条国标规则）与 shared/refconvert.js（外文转国标）不经改动即可在 WebView 运行，'
    '因此格式校对在 Android 端同样是离线、毫秒级、结果可复现；',
    '无服务器：小程序端依赖云函数处理 PDF 与大模型调用，Android 端把这两件事都放在本机——'
    'PDF 用 pdf.js 解析，并按 text item 的纵坐标重建行结构（否则整页会挤成一行，定位不到“参考文献”标题）；',
    'AI 调用由用户自带的 Key 从设备直连模型服务，走原生 HTTP（CapacitorHttp），不受浏览器跨域限制；'
    'Key 只存本机，不经任何服务器中转；',
    '数据不出设备：Android 端的论文文本与文献表默认不写入任何远端存储。',
])
p('两端共用 shared/ 下的同一份实现，用 scripts/sync.js 同步副本，避免行为漂移；界面层各自实现（小程序 WXML / Web HTML），'
  '因此同一份提示词、同一套规则在两端给出完全一致的结果。')
p('Android 安装包规格：体积 4.4 MB，包名 io.github.josiahbristow.docassist，最低支持 Android 5.1（API 22）、'
  '目标 Android 14（API 34），仅申请 INTERNET 权限；安装包随提交材料一并提供，安装步骤见《安装说明-Android.md》。')

h2('5.5 工程化细节')
bullets([
    '超时控制：云函数超时配置 60 秒，请求侧 AbortController 55 秒中断，避免用户长时间无反馈；',
    '错误分级：SCANNED_PDF（扫描版）、KEY_MISSING（未配置密钥）、MODEL_ERROR（接口异常）、PARSE_ERROR（PDF 损坏），前端分别给出可操作提示；',
    '输入约束：单文件 ≤20MB、正文截断至 12 万字，避免云端内存与计费失控；',
    '结果最小留存：云数据库只写标题、页数、字数、参考文献条数与时间，不保存论文正文；',
    '代码组织：shared/ 为单一事实来源，用 scripts/sync.js 同步到小程序端与云函数端，避免两端逻辑漂移。',
])

# ================= 六、核心 AI 模块 =================
h1('六、核心 AI 模块设计')

h2('6.1 结构化速读模块')
p('角色设定为“严谨的学术文献阅读助手，服务对象是本科生”，并写入三条硬约束：只依据原文、不编造数据与结论、'
  '原文没写的字段填“未说明”。输出遵循固定 JSON 结构（title / one_line / problem / method / data / results / '
  'contributions / limitations / usable / keywords / terms），temperature 取 0.2，max_tokens 2200，'
  '结果再做字段归一化（数组化、截断、去空），保证前端拿到的一定是可渲染结构。')

h2('6.2 术语一致的翻译模块')
p('翻译分两步：第一步从原文抽 12–20 个术语，得到“英文=中文”术语表；第二步把术语表作为强约束注入每段翻译请求，'
  '同时要求保留公式、数字与参考文献编号，只输出译文。分段长度 2200 字，避免一段超长导致译文截断。'
  '这样处理的价值在于：通用机翻最常见的缺陷不是句子不通，而是同一术语前后译法不一，读者要在两种译名之间做映射。')

h2('6.3 规则引擎模块（非 AI，但决定作品可用性）')
p('规则引擎共 %d 条规则，按严重程度分为错误（error）、警告（warn）、提示（info）三级，'
  '每条规则自带判定条件、说明文字与可选修正器。逐条计分：100 − 20×错误 − 8×警告 − 2×提示（下限 0）。'
  '校验只对标准明确规定的项报错，不对期刊内部细则做判定，避免误报。' % len(RULES))

h2('6.4 外文体例转换模块（新增）')
p('学生读的英文论文（ACL / EMNLP / NeurIPS / IEEE）参考文献体例与国标差别很大：年份放在末尾、作者用 "and" 连接、'
  '题名与出处不加类型标识，PDF 抽取后还常黏成 "Title.arXiv preprint…"。直接把这类条目丢进国标校验，'
  '18 条规则会全部报错，等于该功能对英文文献不可用。')
p('因此新增一个独立模块 refconvert.js，做三件事：① 体例识别（国标 / ACL 类 / IEEE 类，中文条目一律走国标规则）；'
  '② 字段解析（作者、题名、出处、年、卷期页、arXiv 号，并先修掉 PDF 黏连）；'
  '③ 按 GB/T 7714-2015 重写（外文作者改为「姓 名缩写」，如 "Jimmy Lei Ba" → "Ba J L"；'
  '超过 3 人加 et al.；arXiv 预印本转为 [EB/OL] 并补访问日期与 abs 链接；会议条目转为 [C]//论文集名）。')
p('用《Attention is all you need》原文的全部 38 条参考文献做回归：38 条全部识别为 ACL 体例并成功转换，'
  '0 条误判为国标错误；其中 5 条因原文本身未给页码而输出提示（不硬编造页码），其余 33 条字段完整。'
  '这条链路让“上传英文论文 → 抽取其参考文献 → 一键转成可直接使用的国标条目”真正闭环。')

doc.add_page_break()

# ================= 七、创新点 =================
h1('七、创新点')

h2('7.1 混合架构：确定性的交给规则，语义的交给模型')
p('参赛作品普遍采用“调用大模型总结 PDF”的单一路线。本作品把能力按“能否严格判定”切开：'
  '格式校验完全由规则引擎完成，不消耗 token、不依赖网络、结果可复现；模型只负责理解型任务。'
  '这带来三个可验证的差异：校对功能断网可用、同一输入输出恒定、模型故障时作品仍可用。')

h2('7.2 PDF → 参考文献 → 一键校对 的闭环')
p('速读时顺带把论文的参考文献段落抽出来，直接进入校验与修正。学生写文献表时最耗时的一步（抄、改、对齐格式）'
  '被压缩成一次点击。这一联动在现有工具中没有等价物。')

h2('7.3 术语先对齐再翻译')
p('先建术语表再翻译，把“术语一致性”从模型的随机行为变成显式约束，解决通用机翻的术语漂移问题。')

h2('7.4 外文文献直接可用：体例识别 + 国标重写')
p('这是 7.2 闭环真正能成立的前提：英文论文的参考文献体例与国标完全不同，识别不出来，抽取就只是把一堆'
  '“看起来不像国标”的字符串丢给学生。本作品把体例识别、字段解析、国标重写做成确定性规则，'
  '38 条真实条目零误判转换，字段缺失时宁可提示也不编造。')

h2('7.5 面向真实校园场景的工程取舍')
bullets([
    '零安装、零注册：小程序形态，扫码即用，学生不需要装软件、不需要账号；',
    '手机优先：文献阅读发生在碎片时间，界面按单手操作设计，主要操作都在一屏内完成；',
    '失败也要可解释：明确区分扫描版、网络失败、解析失败，给出下一步动作，而不是转圈或空白。',
])

# ================= 八、数据与隐私 =================
h1('八、数据与隐私保护措施')
table(['风险点', '措施'],
      [['过度采集', '仅处理用户主动选择的文件与粘贴文本，不采集通讯录、位置、相册、设备标识'],
       ['原文存储', 'PDF 存于云存储的用户私有路径；云数据库只记录标题、页数、字数、参考文献条数、时间'],
       ['密钥泄露', 'BYOK：用户填写自己的密钥，仅存于本机 storage；云函数只在内存中转发，不落库、不写日志、'
                    '异常信息自动抹除密钥；前端不以明文回显（输入框为密码类型，仅显示首 6 位与末 4 位）'],
       ['密钥滥用', '云函数对密钥只做格式与可用性校验（verifyKey 不消耗 token），不采集、不上报、不共享'],
       ['传输安全', '全部请求经 HTTPS（云开发默认），不经过第三方中转'],
       ['数据出境', '仅使用境内大模型服务，不接入境外模型接口；不开启任何训练授权'],
       ['内容合规', '使用须知明确：不得上传涉密、内部资料或个人敏感信息；扫描版不做 OCR 上传'],
       ['结果可信', '摘要与译文页脚提示“内容由 AI 生成，引用前请核对原文”，避免学生直接照抄']],
      widths=[3.4, 12.4], caption_text='表 5　数据与隐私保护措施')

# ================= 九、落地 =================
h1('九、落地测试与推广计划')

h2('9.1 已完成的自测')
p('规则引擎已完成 8 组典型样例的回归测试（规范期刊、全角标点混用、缺卷期、缺出版地、缺引用日期、'
  '英文 5 作者未截断、重复条目、缺页码），逐条核对判定与修正输出；PDF 解析在 119 页真题文档上通过'
  '（17.4 万字、非扫描版），参考文献段抽取在中英文两种格式下均正确切分。')
p('外文体例转换以《Attention is all you need》原文 38 条参考文献做回归：38/38 识别为 ACL 体例，'
  '38/38 转换成功，0 条被误判为国标错误，5 条因原文缺页码给出提示而非编造。')

h2('9.2 试用方案')
table(['阶段', '对象与规模', '观察指标', '产出'],
      [['内测（本周）', '团队成员 + 同班 5 人，10 份课程论文文献表', '单份平均修正问题数、修正后通过率', '问题清单与规则误报记录'],
       ['小范围试用（11 月上旬）', '文献检索／论文写作类课程 1–2 个班，约 60 人', '周活跃人数、速读篇数、校对份数、“能看懂”自评（1–5 分）', '试用反馈表'],
       ['推广（11 月中下旬）', '学院公众号、课程群、图书馆学科服务', '新增用户数、复用率', '使用说明与推广文案']],
      widths=[3.0, 5.4, 5.0, 2.9], font_size=9.5, caption_text='表 6　落地测试与推广计划')

h2('9.3 可持续性')
p('云开发基础版免费额度可支撑小规模日常使用（速读单篇成本约 0.01–0.03 元，校对功能零成本），'
  '不需要学校额外投入服务器。后续可接入校内统一认证、图书馆资源与课程平台，'
  '把“格式校对”做成写作课的辅助工具，这是最容易规模化的一环。')

# ================= 十、进度 =================
h1('十、开发进度与分工')
table(['时间', '任务', '状态'],
      [['10/28', '需求收敛、规则引擎与核心链路开发、本地预览验证', '已完成'],
       ['10/29', '小程序端联调、云函数部署、内测试用与问题修正', '进行中'],
       ['10/30 上午', '说明书与汇报 PPT 定稿、演示录屏', '待完成'],
       ['10/30 23:59 前', '材料打包提交至指定邮箱', '—']],
      widths=[3.0, 10.3, 3.0], caption_text='表 7　开发进度（团队分工请在报名材料中按实际填写）')

# ================= 十一、限制 =================
h1('十一、已知限制与后续迭代')
bullets([
    '不支持扫描版 PDF（无 OCR）：当前直接识别并提示，不做无效解析；下一步接入 OCR 或引导用户使用文字版；',
    '超长论文摘要可能损失细节：Map-Reduce 每段只保留 120 字要点，对方法细节的还原有限；下一步改为分层摘要；',
    '规则覆盖常见条目类型，不对期刊内部细则（如作者姓名缩写形式）判定；下一步支持自定义期刊模板；',
    '暂无文献库管理：下一步加入收藏、标签与 Zotero／EndNote 导出；',
    '暂无基于文献的问答（RAG）：下一步在速读基础上做“针对这篇论文提问”，复用已解析文本，成本可控。',
    'AI 功能需用户自备密钥：这与“零门槛”存在张力，靠三点缓解——格式校对无需密钥、设置页 30 秒引导、'
    '未配置时示例模式可完整演示流程；试用阶段可由课程统一申请额度或提供获取指引。',
])

# ================= 附录 =================
doc.add_page_break()
h1('附录 A　参考文献校验规则清单')
p('规则引擎共 %d 条规则，全部为确定性判定，可离线运行。级别说明：错误（必须修改）、警告（建议修改）、提示（可选优化）。'
  % len(RULES), indent=True)
p('另有两条“转换类”条目，只在识别到外文体例时出现：C01（提示）告知该条已按 GB/T 7714 重写并注明原体例；'
  'C02（警告）列出未能从原文识别的字段（如页码），建议人工核对，不做猜测性填充。', indent=True)
table(['编号', '级别', '规则', '说明与修改建议'],
      [[r['id'], {'error': '错误', 'warn': '警告', 'info': '提示'}[r['level']], r['rule'], r['hint']] for r in RULES],
      widths=[1.6, 1.6, 5.4, 7.2], font_size=9, caption_text='表 8　GB/T 7714-2015 校验规则清单')

h1('附录 B　提交材料清单与评分维度对照')
table(['通知要求材料', '本作品对应文件'],
      [['（一）参赛报名表', '按组委表格填写（作品名称：文献助手）'],
       ['（二）作品文件', '小程序体验版二维码 + 小程序代码 + 云函数代码 + Android 安装包（文献助手-1.0.0.apk，4.4 MB，'
                        '兼容 Android 5.1+）+ 安装说明（安装说明-Android.md）；'
                        '扫码即用，格式校对无需账号与密钥，AI 功能需在「API 设置」填入自己的 DeepSeek Key（页内附获取引导）'],
       ['（三）作品说明书', '本文件'],
       ['（四）评审汇报 PPT', '《文献助手-评审汇报.pptx》（12 页）'],
       ['补充材料', '演示录屏（3 分钟）、规则引擎回归测试输出']],
      widths=[5.4, 10.4], caption_text='表 9　提交材料清单')

table(['评分维度（分值）', '本作品对应内容'],
      [['校园落地实用性（40）', '痛点来自本班课程论文实测（86 条文献中 41 条不合格）；校对功能零成本、离线可用；'
                              '试用方案已排到班级与课程层面；PDF→文献表闭环贴合真实写作流程'],
       ['AI 技术应用能力（30）', '大模型结构化抽取 + Map-Reduce 长文摘要 + 术语约束翻译；规则引擎承担确定性判定；'
                               '超时、错误码、扫描版识别等稳定性设计'],
       ['创新创意水平（20）', '规则与模型的混合架构；PDF→参考文献→一键校对闭环；术语先对齐再翻译'],
       ['作品完整规范度（10）', '材料四件齐全；说明书按通知要求逐项对应；代码分层、注释与 README 完整；本地预览可复现']],
      widths=[4.4, 11.4], font_size=9.5,
      caption_text='表 10　评分维度对照（作品自述，供评委参考）')

footer_pagenum()
doc.save(OUT)
print('saved', OUT, os.path.getsize(OUT), 'bytes')
