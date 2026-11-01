/**
 * ui-i18n.js —— 界面语言（Android 与本地预览网页共用）
 * 静态文案按中文精确匹配替换（切回中文时从 __zh 恢复）；动态文案用 tr()/trf()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UIi18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
/**
 * i18n.js —— 界面语言（中文 / English）
 *
 * 静态文案：按中文原文精确匹配替换（切换回中文时从 __zh 恢复），
 * 动态文案：用 tr()/trf() 在生成时翻译。
 */
const LANG_KEY = 'docai_lang';

const EN = {
  // 头部 / 首页
  '文献助手': 'DocAssist',
  '把文献读薄，': 'Read deeply,',
  '把格式读对': 'cite it right.',
  '论文原文 · 速读要点 · 相似论文 · 参考文献校对': 'Full text · Quick read · Similar papers · Reference check',
  '划词翻译 · 高亮备注 · AI 助手': 'Select to translate · Highlights · AI assistant',
  '论文阅读': 'Paper reading',
  '先读原文，速读在后台生成；划词翻译、高亮备注': 'Read the text first; the summary builds in the background. Select to translate or highlight.',
  '参考文献格式校对': 'Reference check',
  '18 条国标规则逐条判定，外文自动转国标，离线可用': '18 GB/T 7714 rules · auto-converts foreign styles · works offline',
  '配置你自己的 API Key': 'Set up your API key',
  '速读与翻译需要你的 DeepSeek Key；格式校对不需要': 'Quick read and translation need your DeepSeek key; reference check does not',
  '学术翻译': 'Academic translation',
  '术语先对齐再翻译，同一术语全文译名一致': 'Terms are aligned first so wording stays consistent',
  'API 设置': 'API settings',
  '尚未配置，速读与翻译暂不可用': 'Not configured; quick read and translation unavailable',
  '最近打开': 'Recent papers',
  '已读论文': 'Papers read',
  '篇': '',
  '修正格式': 'Fixes',
  '处': '',
  '支持有文字层的 PDF；扫描版暂不支持。文献内容仅用于本次生成，不做长期保存。': 'Text-based PDFs only; scanned PDFs are not supported. Papers are used only for this session.',

  // 阅读页
  '选一份 PDF': 'Choose a PDF',
  '25MB 以内。选完立即打开原文；速读在后台生成，不打断阅读。': 'Up to 25MB. The text opens immediately; the summary builds in the background.',
  '选择 PDF 文件': 'Choose PDF',
  '一个页面，两种读法': 'One page, two ways to read',
  '原文：逐页阅读、划词翻译、高亮备注（预览与高亮不需要 Key）': 'Text: page-by-page reading, select-to-translate, highlights (no key needed)',
  '速读：要点 / 结构 / 术语，并自动联动参考文献校对（需要 Key）': 'Summary: key points / structure / terms, plus reference check (needs a key)',
  '导出': 'Export',
  '换一篇': 'Change',
  '暂无标注': 'No highlights',
  '01 原文': '01 Text',
  '02 要点': '02 Summary',
  '03 结构': '03 Structure',
  '04 术语': '04 Terms',
  '05 相似': '05 Similar',
  '06 译文': '06 Translation',
  '长按选词 → 翻译 / 高亮；点高亮处加备注': 'Long-press to select → translate / highlight; tap a highlight to add a note',
  '长按选词 → 翻译 / 高亮；点高亮处加备注；点页面左右两侧翻页；左边缘右滑返回；批注时单指书写、双指移动': 'Long-press to select → translate / highlight; tap a highlight to add a note; tap the page sides to turn pages; swipe right from the left edge to go back; in pen mode draw with one finger, move with two',
  '拖选文字 → 翻译 / 高亮；点高亮处加备注；批注时单指书写、双指移动': 'Drag to select → translate / highlight; tap a highlight to add a note; in pen mode draw with one finger, move with two',
  '研究问题': 'Problem',
  '方法': 'Method',
  '数据与实验': 'Data & experiments',
  '主要结论': 'Findings',
  '速读生成后在这里显示，可先看「原文」': 'The summary will appear here. You can read the text first.',
  '创新点': 'Contributions',
  '局限': 'Limitations',
  '可借鉴之处': 'Takeaways',
  '术语对照': 'Terms',
  '检查这篇论文的参考文献': 'Check references',
  '复制速读结果': 'Copy summary',
  '全文翻译': 'Translate paper',
  '点右侧「译」把整篇论文翻译成中文；按段落显示，术语全文统一。': 'Tap “译” in the side rail to translate the whole paper. Paragraphs are shown in order with consistent terms.',
  '复制译文': 'Copy translation',

  // 相似论文
  '检索相似论文': 'Find similar papers',
  '按关键词在国内平台检索同主题文献；相关论文按标题自动检索，摘要可在应用内展开。': 'Search Chinese platforms by keywords; related papers are matched by title with inline abstracts.',
  '检索相关论文': 'Search related',
  '复制检索词': 'Copy query',
  '国内平台': 'Chinese platforms',
  '国内平台需要登录或机构权限；点击后用系统浏览器打开检索结果，本应用不抓取平台内容。': 'Chinese platforms need login or institutional access; links open in your browser. This app does not scrape them.',

  // 操作条 / 备注
  '翻译': 'Translate',
  '问 AI': 'Ask AI',
  '高亮': 'Highlight',
  '取消': 'Cancel',
  '标注备注': 'Note',
  '删除': 'Delete',
  '保存备注': 'Save note',
  '关闭': 'Close',

  // AI 助手
  'AI 助手': 'AI assistant',
  '引用选中': 'Use selection',
  '当前页': 'Current page',
  '清空': 'Clear',
  '主题': 'Theme',
  '语言': 'Language',
  '未配置 Key：': 'No API key: ',
  '去 API 设置': 'Open settings',
  '。原文、高亮、格式校对不受影响。': ' Text, highlights and reference check still work.',
  '选中文字后点「问 AI」，或直接输入问题。也可以附一张图（需要支持视觉的模型，如 gpt-4o / qwen-vl）。': 'Select text and tap Ask AI, or just type. You can attach an image (needs a vision model such as gpt-4o / qwen-vl).',
  '图片提问需要视觉模型（DeepSeek 文本模型不支持图片）。': 'Image questions need a vision model (DeepSeek text models cannot read images).',
  '发送': 'Send',

  // 校对
  '粘贴参考文献': 'Paste references',
  '从 Word、知网或英文论文里整段复制，一行一条，不用整理编号。英文论文的参考文献（ACL / IEEE 体例）会自动识别并转换为国标格式。': 'Copy from Word, CNKI or an English paper, one entry per line, no numbering needed. ACL / IEEE styles are converted to GB/T 7714.',
  '中文示例': 'Chinese sample',
  '英文示例': 'English sample',
  '开始检查': 'Check',
  '校验依据 GB/T 7714-2015，纯本地规则计算，断网也能用。': 'Based on GB/T 7714-2015; computed locally and offline.',

  // 翻译页
  '粘贴英文段落': 'Paste an English paragraph',
  '先抽取术语并统一译名，再逐段翻译，避免同一术语前后译法不一致。': 'Terms are aligned first so wording stays consistent across paragraphs.',

  // 设置
  '使用你自己的 API Key': 'Use your own API key',
  '速读与翻译直连 DeepSeek，费用走你自己的账户。Key 只保存在这台手机上，不上传服务器。': 'Quick read and translation call DeepSeek with your key. It stays on this device.',
  '尚未配置': 'Not configured',
  '清除': 'Clear',
  '填写 Key': 'Enter key',
  '测试连接': 'Test',
  '保存到本机': 'Save',
  '还没有 Key？': 'No key yet?',
  '① 打开 platform.deepseek.com 注册登录 ② 进入「API keys」创建 Key ③ 复制（以 sk- 开头，只显示一次） ④ 回到本页粘贴保存。': '1. Sign up at platform.deepseek.com  2. Create a key under API keys  3. Copy it (starts with sk-, shown once)  4. Paste and save here.',
  '费用参考：单篇论文速读约消耗 2–6 千 tokens，按现行价格约几分钱；格式校对不消耗 tokens。': 'A paper summary uses about 2–6k tokens (a few cents); reference checks are free.',
  '高级：接口地址与模型': 'Advanced: endpoint & model',
  '默认 DeepSeek 官方接口。也支持任何 OpenAI 兼容服务（如硅基流动、智谱），需包含 /v1。': 'Defaults to DeepSeek. Any OpenAI-compatible endpoint works (must include /v1).',
  '保存接口地址': 'Save endpoint',
  '模型名称默认 deepseek-chat。要用图片提问，请填写支持视觉的模型（如 gpt-4o、qwen-vl-max）。': 'Default model is deepseek-chat. For image questions use a vision model (gpt-4o, qwen-vl-max).',
  '保存模型名称': 'Save model',
  '不要把 Key 发到群聊或截图里；本应用不会上传你的 Key，也无法读取你在其他应用里的 Key。': 'Never share your key. This app never uploads it and cannot read keys in other apps.',

  // 动态提示
  '文件请小于 25MB': 'File must be under 25MB',
  '正在打开 PDF…': 'Opening PDF…',
  '打不开这个 PDF：': 'Cannot open this PDF: ',
  '未配置 Key：原文、高亮、格式校对可用；速读与划词翻译需要 Key': 'No API key: text, highlights and reference check work; quick read and translation need a key',
  '去设置': 'Settings',
  '速读生成中，可先看原文…': 'Building the summary; read the text meanwhile…',
  '这是扫描版 PDF：原文可翻页查看，但速读需要文字层（暂无 OCR）': 'Scanned PDF: pages can be viewed, but the summary needs a text layer (no OCR yet)',
  '速读已生成': 'Summary ready',
  '速读失败：': 'Summary failed: ',
  '重试': 'Retry',
  '已恢复': 'Restored ',
  '处标注': ' highlights',
  '加载中…': 'Loading…',
  '正在翻译…': 'Translating…',
  '译文': 'Translation',
  '已高亮 · 点高亮处可加备注': 'Highlighted · tap it to add a note',
  '备注已保存': 'Note saved',
  '已删除这处标注': 'Highlight deleted',
  '还没有标注，先选中文字点「高亮」': 'No highlights yet. Select text and tap Highlight.',
  '标注已复制为 Markdown': 'Highlights copied as Markdown',
  '译文已复制': 'Translation copied',
  '请选择图片文件': 'Please choose an image file',
  '先在页面里选中一段文字': 'Select some text first',
  '先打开一篇 PDF，再截取当前页': 'Open a PDF first, then capture the page',
  '已附上当前页截图': 'Page screenshot attached',
  '输入问题，或添加一张图片': 'Type a question or attach an image',
  '请先在「API 设置」配置 Key': 'Set up your API key first',
  '思考中…': 'Thinking…',
  '（没有返回内容）': '(no content returned)',
  '出错了：': 'Error: ',
  '生成速读后，可按标题检索相关论文': 'Generate the summary first to search related papers by title',
  '检索中…': 'Searching…',
  '检索词为空': 'Query is empty',
  '检索词已复制': 'Query copied',
  '摘要': 'Abstract',
  '收起': 'Hide',
  '正在打开原文…': 'Opening the text…',
  '速读生成中…': 'Building the summary…',
  '原文打不开，仍可查看速读结果': 'The text could not open; the summary is still available',
  '速读失败：': 'Summary failed: ',
  '正在检索相关论文…': 'Searching related papers…',
  '全文翻译需要 API Key': 'Full translation needs an API key',
  '请先打开一篇论文': 'Open a paper first',
  '可读文本过少': 'Too little readable text',
  '翻译完成': 'Translation ready',
  '翻译失败：': 'Translation failed: ',
  '翻译中': 'Translating',
  '开始翻译': 'Start',
  '将翻译全文': 'Translate the whole paper',
  '约': 'about',
  '字': 'characters',
  '段': 'segments',
  '使用你的 Key 调用模型。': 'Uses your key to call the model.',
  '取消翻译': 'Cancel',

  // 侧栏
  'AI 助手': 'AI assistant'
};

const TPL = {
  '检查这篇论文的参考文献（{n} 条）': 'Check references ({n})',
  '术语对照（{n} 条）': 'Terms ({n})',
  '共 {n} 篇 · 按标题检索（OpenAlex / Crossref）': '{n} results · title search (OpenAlex / Crossref)',
  '翻译中 {i}/{n}…': 'Translating {i}/{n}…',
  '约 {chars} 字，分 {n} 段调用。': 'About {chars} characters, {n} segments.',
  '将翻译全文（约 {chars} 字，分 {n} 段）。': 'Translate the whole paper (about {chars} characters, {n} segments).',
  '已读论文 {n} 篇': '{n} papers read',
  '修正格式 {n} 处': '{n} fixes',
  '{name} · {pages} 页 · {chars} 字': '{name} · {pages} pp · {chars} chars',
  '{hex} · HSL {h}° {s}% {l}% · 对比度 {r}:1': '{hex} · HSL {h}° {s}% {l}% · Contrast {r}:1'
};

// 动态文案补充
Object.assign(EN, {
  '知网': 'CNKI',
  '万方': 'Wanfang',
  '维普': 'VIP',
  '百度学术': 'Baidu Scholar',
  'Google 学术': 'Google Scholar',
  '期刊 / 学位论文': 'Journal / thesis',
  '中文期刊': 'Chinese journals',
  '聚合检索': 'Aggregator',
  '英文文献': 'English literature',
  '打开': 'Open',
  '没有找到相关论文，可修改检索词后使用上方国内平台链接': 'No related papers found. Edit the query or use the platform links above.',
  '检索失败：': 'Search failed: ',
  '先生成速读，再检索相关论文': 'Generate the summary first.',
  '已翻译前 30 段（论文过长）。': 'Translated the first 30 segments (paper too long).',
  '扫描版 PDF 没有文字层，无法翻译': 'Scanned PDF has no text layer to translate.',
  '已配置：': 'Configured: ',
  '当前未配置 Key：原文、高亮、格式校对可用；速读与划词翻译需要 Key': 'No API key: text, highlights and reference check work; quick read and translation need a key',
  '模型名称已保存：': 'Model saved: ',
  '已恢复默认模型': 'Default model restored',
  '请先粘贴 Key': 'Paste your key first',
  'Key 格式不对：应以 sk- 开头': 'Key should start with sk-',
  '已保存到本机': 'Saved on this device',
  '已清除本机 Key': 'Key cleared',
  '地址需以 http(s):// 开头': 'Endpoint must start with http(s)://',
  '接口地址已保存': 'Endpoint saved',
  '已恢复默认接口': 'Default endpoint restored',
  '连接成功': 'Connected',
  '可用模型：': ' Models: ',
  '校验失败': 'Check failed',
  '测试中…': 'Testing…',
  '这篇论文没有可提取的专业术语。': 'No terms extracted from this paper.',
  '术语表': 'Glossary',
  '原文': 'Original',
  '复制全部译文': 'Copy all',
  '复制': 'Copy',
  '出错了': 'Error',
  '正在抽取术语并翻译…': 'Extracting terms and translating…',
  '速读结果已复制': 'Summary copied',
  '已删除这条记录': 'Record deleted',
  '这条记录已失效，请重新选择文件': 'This record expired; choose the file again',
  '已恢复': 'Restored',
  '处标注': 'highlights',
  '请先粘贴参考文献': 'Paste references first',
  '正在校验…': 'Checking…',
  '已复制': 'Copied',
  '复制失败，请长按选择': 'Copy failed; press and hold to select',
  '已修正': 'Fixed',
  '处格式问题': ' formatting issues',
  '参考文献表已复制': 'Reference list copied',
  'BibTeX 已复制': 'BibTeX copied',
  '可直接使用上方平台链接': ' You can use the platform links above.',
  '删除高亮': 'Remove highlight',
  '导出标注版 PDF': 'Export annotated PDF',
  '导出 Markdown 笔记': 'Export Markdown',
  '把当前标注（高亮 + 画笔）写入原 PDF，生成标注版文件。': 'Bake highlights and ink into the original PDF.',
  '正在生成 PDF…': 'Generating PDF…',
  '已经是第一页': 'Already on the first page',
  '已经是最后一页': 'Already on the last page',
  '标注版 PDF 已下载': 'Annotated PDF downloaded',
  '已打开分享': 'Share sheet opened',
  '导出失败：': 'Export failed: ',
  '还没有标注': 'No annotations yet',
  '找不到原文件': 'Original file not found',
  '保存或分享标注版 PDF': 'Save or share annotated PDF',
  '保存失败：': 'Save failed: ',
  'PDF 导出组件未加载': 'PDF export module not loaded',
  '请先粘贴英文段落': 'Paste an English paragraph first',
  '这篇 PDF 没找到参考文献段': 'No reference section found in this PDF',
  '批注': 'Annotate',
  '撤销': 'Undo',
  '橡皮': 'Eraser',
  '完成': 'Done',
  '自定义画笔颜色': 'Custom pen color',
  '应用': 'Apply',
  '没有可撤销的笔迹': 'Nothing to undo',
  '用手指或鼠标在页面上书写': 'Draw with one finger; use two fingers to move the page',
  '单指书写，双指移动页面': 'Draw with one finger; move the page with two',
  '对比度不足 WCAG 4.5:1': 'Contrast below WCAG 4.5:1',
  '自动加深': 'Auto darken'
});


// 补充文案（阅读 / 翻译 / 状态）
Object.assign(EN, {
  '文献助手 · 预览': 'DocAssist · preview',
  '上传一篇 PDF': 'Upload a PDF',
  '拖拽或点击选择文件，20MB 以内。选完立即打开原文；速读在后台生成。也可以直接粘贴正文文本。': 'Drag or choose a file (up to 20MB). The text opens immediately; the summary builds in the background. You can also paste text.',
  '改为粘贴文本': 'Paste text instead',
  '重新选择文件': 'Choose another file',
  '再读一篇': 'Read another',
  '示例模式：未配置 API Key（AI 结果为示例数据）；格式校对为真实计算结果': 'Demo mode: no API key (AI results are samples); reference check is real.',
  '粘贴论文正文（前 12000 字足够）': 'Paste the paper text (first 12,000 characters is enough)',
  '当前未配置 Key：点击后将返回示例数据（可在「API 设置」填入你自己的 Key）': 'No key: results will be sample data (set your key in API settings).',
  '生成耗时': 'Generated in',
  '内容由 AI 依据原文生成，引用前请核对原文。': 'Generated by AI from the source; verify before citing.',
  '复制全部译文': 'Copy all',
  '开始翻译': 'Start',
  '取消翻译': 'Cancel',
  '将翻译全文': 'Translate the whole paper',
  '使用你的 Key 调用模型。': 'Uses your key to call the model.',
  '翻译中': 'Translating',
  '翻译完成': 'Translation ready',
  '翻译失败：': 'Translation failed: ',
  '已翻译前 30 段（论文过长）。': 'Translated the first 30 segments (paper too long).',
  '扫描版 PDF 没有文字层，无法翻译': 'Scanned PDF has no text layer to translate.',
  '请先打开一篇论文': 'Open a paper first',
  '可读文本过少': 'Too little readable text',
  '全文翻译需要 API Key': 'Full translation needs an API key',
  '复制译文': 'Copy translation',
  '被引': 'Cited',
  '文件请小于 20MB': 'File must be under 20MB',
  '已复制到剪贴板': 'Copied',
  '正在打开原文…': 'Opening the text…',
  '原文打不开，仍可查看速读结果': 'The text could not open; the summary is still available',
  ' → 打开 ': ' → Open ',
  '→ 打开': '→ Open',
  '打开': 'Open',
  '按 GB/T 7714-2015 逐条检查，一键修正并导出规范文献表': 'Check against GB/T 7714-2015, fix and export a clean reference list',
  '支持有文字层的 PDF（知网 / arXiv 导出的均可）；扫描版暂不支持。文献内容仅用于本次生成，不做长期保存。': 'Text-based PDFs (CNKI / arXiv exports); scanned PDFs unsupported. Content is used only for this session.'
});

const SKIP = [
  '#pv-mount', '#sim-results', '#ai-msgs', '#cite-result', '#tr-result',
  '#r-title', '#r-oneline', '#r-tags', '#r-problem', '#r-method', '#r-data',
  '#r-results', '#r-contrib', '#r-limits', '#r-usable', '#r-terms', '#r-filemeta',
  '#btn-refs', '#pv-sheet-text', '#pv-note-quote', '#ai-chip-text', '#pv-name',
  '#read-banner', '#trans-status', '#trans-dialog-text', '#trans-note', '#recent-list',
  '#recent-read', '#sim-status', '#pv-count', '#trans-body', '#r-terms-label'
];

let lang = 'zh';

function detect() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'en' || v === 'zh') lang = v;
  } catch (e) {}
  return lang;
}
detect();

function getLang() { return lang; }

function setLang(next) {
  lang = next === 'en' ? 'en' : 'zh';
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  return lang;
}

function tr(text) {
  if (lang !== 'en') return text;
  return Object.prototype.hasOwnProperty.call(EN, text) ? EN[text] : text;
}

function trf(tpl, vars) {
  const zh = tpl.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
  if (lang !== 'en') return zh;
  const pattern = TPL[tpl];
  if (!pattern) return zh;
  return pattern.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
}

function skipped(node) {
  const el = node.parentElement;
  if (!el) return false;
  return SKIP.some(sel => !!el.closest(sel));
}

function translateTextNodes() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue;
    if (!raw || !raw.trim()) continue;
    if (skipped(node)) continue;
    const key = raw.trim();
    if (lang === 'en') {
      if (!Object.prototype.hasOwnProperty.call(EN, key)) continue;
      if (!node.__zh) node.__zh = raw;
      node.nodeValue = raw.replace(key, EN[key]);
    } else if (node.__zh) {
      node.nodeValue = node.__zh;
      node.__zh = null;
    }
  }
}

function translatePlaceholders() {
  const fields = document.querySelectorAll('input[placeholder],textarea[placeholder]');
  for (const el of fields) {
    if (!el.__zhPh) el.__zhPh = el.placeholder;
    if (lang === 'en' && Object.prototype.hasOwnProperty.call(EN, el.__zhPh)) {
      el.placeholder = EN[el.__zhPh];
    } else {
      el.placeholder = el.__zhPh;
    }
  }
}

function applyLanguage() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = lang === 'en' ? 'DocAssist' : '文献助手';
  translateTextNodes();
  translatePlaceholders();
}

function relTime(ts) {
  const now = Date.now();
  const diff = Math.max(0, now - Number(ts || 0));
  const min = Math.floor(diff / 60000);
  const en = lang === 'en';
  if (min < 1) return en ? 'just now' : '刚刚';
  if (min < 60) return en ? min + ' min ago' : min + ' 分钟前';
  const hour = Math.floor(min / 60);
  if (hour < 24) return en ? hour + ' h ago' : hour + ' 小时前';
  const day = Math.floor(hour / 24);
  if (day < 7) return en ? day + ' d ago' : day + ' 天前';
  const d = new Date(Number(ts));
  return (d.getMonth() + 1) + '/' + d.getDate();
}

  return {
    tr: tr, trf: trf, applyLanguage: applyLanguage,
    setLang: setLang, getLang: getLang, relTime: relTime
  };

});
