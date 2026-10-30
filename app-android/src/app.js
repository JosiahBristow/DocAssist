/**
 * app.js —— 文献助手 Android 端界面逻辑
 * 复用 shared/gb7714.js（18 条国标规则）+ shared/refconvert.js（外文→国标）
 * 全部计算在本机完成，无需服务器；AI 功能由用户自带的 Key 直连模型。
 */
import * as gb from '../../shared/gb7714.js';
import { extractReferenceSection } from '../../shared/refsection.js';
import { pdfToText } from './pdftext.js';
import { summarize, translate, verifyKey, store } from './llm.js';
import { createPreview } from './preview.js';
import { createSimilarSearch } from './search.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 提示 ---------------- */
let _toast;
function toast(msg) {
  if (!_toast) {
    _toast = document.createElement('div');
    _toast.className = 'toast';
    document.body.appendChild(_toast);
  }
  _toast.textContent = String(msg || '');
  _toast.classList.add('on');
  clearTimeout(_toast._t);
  _toast._t = setTimeout(() => _toast.classList.remove('on'), 2400);
}

/* ---------------- 导航 ---------------- */
const TITLES = { home: '文献助手', read: '论文阅读', cite: '参考文献格式校对', translate: '学术翻译', settings: 'API 设置' };
let cur = 'home';
const stack = [];

function go(name, push = true) {
  if (push && name !== cur) {
    stack.push(cur);
    // 让 Android 的返回键走应用内返回，而不是直接退出
    try { history.pushState({ screen: name }, ''); } catch (e) {}
  }
  cur = name;
  ['home', 'read', 'cite', 'translate', 'settings'].forEach(n => {
    const el = $('screen-' + n);
    if (el) el.hidden = n !== name;
  });
  $('navtitle').textContent = TITLES[name];
  $('back').hidden = name === 'home';
  document.querySelector('.screen:not([hidden])').scrollTop = 0;
}
function back() {
  // 与浏览器/Android 返回键共用同一条历史，避免"栈"与历史双份状态不一致
  if (stack.length) { history.back(); return; }
  go('home', false);
}
$('back').addEventListener('click', back);
window.addEventListener('popstate', () => {
  const prev = stack.pop() || 'home';
  go(prev, false);
});

/* ---------------- 使用统计 ---------------- */
const STAT_KEY = 'docai_stats';
function stats() { return JSON.parse(localStorage.getItem(STAT_KEY) || '{"papers":0,"fixed":0}'); }
function bump(k, n) {
  const s = stats(); s[k] = (s[k] || 0) + n;
  localStorage.setItem(STAT_KEY, JSON.stringify(s));
  renderStats();
}
function renderStats() {
  const s = stats();
  $('st-papers').textContent = s.papers;
  $('st-fixed').textContent = s.fixed;
}

/* ---------------- Key 状态 ---------------- */
function maskKey(k) { return k ? k.slice(0, 6) + '••••••' + k.slice(-4) : ''; }
function renderKey() {
  const k = store.key;
  $('keybar').hidden = !!k;
  $('keystate').textContent = k ? '已配置：' + maskKey(k) : '尚未配置，速读与翻译暂不可用';
  $('state-dot').style.color = k ? '#12B76A' : '#B7BFD2';
  $('state-text').textContent = k ? '已配置：' + maskKey(k) : '尚未配置';
  $('read-needkey').textContent = k ? '' : '当前未配置 Key：原文、高亮、格式校对可用；速读与划词翻译需要 Key';
}

/* ================= 格式校对 ================= */
const SAMPLE = `[1] 周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.
[2] 李四，王五. 深度学习综述 [J]. 计算机学报，2020，43（6）：1001～1020
[3] OpenAI. GPT-4 Technical Report[EB/OL]. https://arxiv.org/abs/2303.08774
[4] 张三. 面向校园场景的智能问答系统研究[D]. 长沙: 国防科技大学, 2023.`;

const SAMPLE_EN = `Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization.arXiv preprint arXiv:1607.06450, 2016.
Sepp Hochreiter and Jürgen Schmidhuber. Long short-term memory.Neural computation, 9(8):1735–1780, 1997.
Kaiming He, Xiangyu Zhang, Shaoqing Ren, and Jian Sun. Deep residual learning for image recognition. InProceedings of the IEEE Conference on Computer Vision and Pattern Recognition, pages 770–778, 2016.
Diederik Kingma and Jimmy Ba. Adam: A method for stochastic optimization. InICLR, 2015.`;

let citeData = null;
const citeOpen = {};

function runCite() {
  const text = $('cite-input').value.trim();
  if (!text) { toast('请先粘贴参考文献'); return; }
  citeData = gb.checkText(text, { sort: true, dedupe: true });
  Object.keys(citeOpen).forEach(k => delete citeOpen[k]);
  citeData.items.forEach((it, i) => { if (it.stats.errs > 0) citeOpen[i] = true; });
  renderCite();
}

function renderCite() {
  const r = citeData;
  if (!r) return;
  const cls = r.passRate >= 80 ? 'ok' : (r.passRate >= 50 ? 'warn' : 'err');
  let html = `
  <div class="card">
    <div class="sum-row">
      <div class="sum-item"><div class="sum-num">${r.total}</div><div class="sum-label">条文献</div></div>
      <div class="sum-item"><div class="sum-num ${cls}">${r.passRate}%</div><div class="sum-label">通过率</div></div>
      <div class="sum-item"><div class="sum-num err">${r.errCount}</div><div class="sum-label">有问题</div></div>
    </div>
    <div class="muted">${esc(r.summary)}</div>
    ${r.convertedCount ? `<div class="convnote">检测到 ${r.convertedCount} 条外文文献，已按 GB/T 7714 改写：姓前名缩写、&gt;3 人加 et al.、arXiv 预印本转为 [EB/OL] 并补引用日期。</div>` : ''}
    <div class="divider"></div>
    <div>
      <span class="btn-mini" onclick="DA.fixAll()">一键修正全部</span>
      <span class="btn-mini" onclick="DA.copyList()">复制文献表</span>
      <span class="btn-mini" onclick="DA.copyBib()">复制 BibTeX</span>
      <span class="btn-mini" onclick="DA.clearCite()">清空</span>
    </div>
  </div>`;

  r.items.forEach((it, i) => {
    const k = it.stats.errs > 0 ? 'bad' : (it.stats.warns > 0 ? 'mid' : '');
    html += `<div class="item ${k}" onclick="DA.toggleItem(${i})">
      <div class="item-head">
        <div class="item-no">${i + 1}</div>
        <div class="item-type">${esc(it.typeName || '未识别类型')}</div>
        ${it.converted ? '<span class="convbadge">外文→国标</span>' : ''}
        <div class="item-score ${it.score >= 80 ? 'ok' : (it.score >= 50 ? 'warn' : 'err')}">${it.score} 分</div>
      </div>
      <div class="item-orig">${esc(it.original)}</div>
      ${it.duplicateOf ? `<div class="muted err">与第 ${it.duplicateOf} 条重复</div>` : ''}`;
    if (citeOpen[i]) {
      html += '<div class="divider"></div>';
      it.problems.forEach(p => {
        const sym = p.level === 'error' ? '✕' : (p.level === 'warn' ? '!' : 'i');
        html += `<div class="prob"><span class="dot ${p.level === 'error' ? 'err' : (p.level === 'warn' ? 'warn' : '')}">${sym}</span>
          <div><div class="prob-rule">${esc(p.rule)}</div><div class="prob-hint">${esc(p.hint)}</div></div></div>`;
      });
      if (it.changed) {
        html += `<div class="fixed-box"><div class="fixed-label">${it.converted ? '已转换为国标格式' : '建议改为'}</div>
          <div class="fixed-text">${esc(it.fixed)}</div>
          <span class="btn-mini" onclick="event.stopPropagation();DA.copyOne(${i})">复制这条</span></div>`;
      }
    } else {
      html += `<div class="muted" style="margin-top:6px">${it.converted ? '点开看转换说明' : '点开看 ' + it.problems.length + ' 个问题'} ›</div>`;
    }
    html += '</div>';
  });
  html += '<div class="footnote">校验依据 GB/T 7714-2015《信息与文献 参考文献著录规则》。各期刊社可能有更细的内部要求，最终以投稿指南为准。</div>';
  $('cite-result').innerHTML = html;
}

function fixAll() {
  if (!citeData) return;
  let n = 0;
  citeData.items.forEach(it => { if (it.changed) n += it.problems.filter(p => p.hasFix).length; });
  $('cite-input').value = gb.toReferenceList(citeData.items, true);
  bump('fixed', n);
  runCite();
  toast('已修正 ' + n + ' 处格式问题');
}
function copyList() {
  if (!citeData) return;
  copy(gb.toReferenceList(citeData.items, true), '参考文献表已复制');
}
function copyBib() {
  if (!citeData) return;
  copy(gb.toBibTeX(citeData.items.filter(it => !it.duplicateOf)), 'BibTeX 已复制');
}
function copyOne(i) { copy(citeData.items[i].fixed, '已复制'); }
function clearCite() {
  $('cite-input').value = '';
  citeData = null;
  $('cite-result').innerHTML = '';
}
function toggleItem(i) { citeOpen[i] = !citeOpen[i]; renderCite(); }
function copy(text, msg) {
  const done = () => toast(msg);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请长按选择'); }
  document.body.removeChild(ta);
}

/* ================= 论文阅读（原文 + 速读） ================= */
let lastRefs = [];
let lastPdfName = '';
let lastPdfFile = null;
let readToken = 0;
let summaryDone = false;

function setBanner(kind, text, actionText, action) {
  const bar = $('read-banner');
  if (!bar) return;
  if (!text) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.className = 'read-banner' + (kind ? ' ' + kind : '');
  $('read-banner-text').textContent = text;
  const a = $('read-banner-action');
  if (actionText) {
    a.hidden = false;
    a.textContent = actionText;
    a.onclick = action;
  } else {
    a.hidden = true;
    a.onclick = null;
  }
}

function showReadMain() {
  $('read-idle').hidden = true;
  $('read-main').hidden = false;
}
function showReadIdle() {
  $('read-main').hidden = true;
  $('read-idle').hidden = false;
  $('pdfpick').value = '';
}

function resetSummary() {
  summaryDone = false;
  ['read-meta', 'summary-quick', 'summary-full', 'summary-terms', 'read-actions']
    .forEach(id => { $(id).hidden = true; });
  ['quick-wait', 'full-wait', 'terms-wait'].forEach(id => { $(id).hidden = false; });
  $('r-filemeta').textContent = '';
  $('r-title').textContent = '';
  $('r-oneline').textContent = '';
  $('r-tags').innerHTML = '';
  lastRefs = [];
  similar.reset();
}

async function onPickFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { toast('文件请小于 25MB'); return; }

  const token = ++readToken;
  lastPdfName = file.name || 'paper.pdf';
  lastPdfFile = file;

  showReadMain();
  resetSummary();
  setBanner('', '正在打开 PDF…');

  try {
    await preview.openFile(file);
  } catch (err) {
    if (token !== readToken) return;
    showReadIdle();
    setBanner('');
    toast('打不开这个 PDF：' + String(err.message || err).slice(0, 80));
    return;
  }
  if (token !== readToken) return;
  readTab('orig');

  if (!store.key) {
    setBanner('warn', '未配置 Key：原文、高亮、格式校对可用；速读与划词翻译需要 Key', '去设置', () => go('settings'));
    return;
  }
  setBanner('', '速读生成中，可先看原文…');
  runSummary(file, token);
}

async function runSummary(file, token) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfToText(buf);
    if (token !== readToken) return;
    if (pdf.scanned) {
      setBanner('warn', '这是扫描版 PDF：原文可翻页查看，但速读需要文字层（暂无 OCR）');
      return;
    }
    const summary = await summarize(pdf.text);
    if (token !== readToken) return;
    lastRefs = extractReferenceSection(pdf.text).entries;
    renderSummary(summary, pdf);
    bump('papers', 1);
    setBanner('');
    toast('速读已生成');
  } catch (err) {
    if (token !== readToken) return;
    setBanner('err', '速读失败：' + String(err.message || err).slice(0, 90), '重试', () => {
      const t = ++readToken;
      setBanner('', '速读生成中，可先看原文…');
      runSummary(lastPdfFile, t);
    });
  }
}

function renderSummary(s, pdf) {
  summaryDone = true;
  $('r-filemeta').textContent = `${lastPdfName} · ${pdf.pages} 页 · ${pdf.chars} 字`;
  $('r-title').textContent = s.title;
  $('r-oneline').textContent = s.one_line;
  $('r-tags').innerHTML = s.keywords.map(k => `<span class="tag">${esc(k)}</span>`).join('');
  $('r-problem').textContent = s.problem;
  $('r-method').textContent = s.method;
  $('r-data').textContent = s.data;
  const li = arr => arr.map(x => `<div class="li"><b>·</b><span>${esc(x)}</span></div>`).join('');
  $('r-results').innerHTML = li(s.results);
  $('r-contrib').innerHTML = li(s.contributions);
  $('r-limits').innerHTML = li(s.limitations);
  $('r-usable').innerHTML = li(s.usable);
  $('r-terms-label').textContent = `术语对照（${s.terms.length} 条）`;
  $('r-terms').innerHTML = s.terms.length ? s.terms.map(t =>
    `<div class="term"><div class="term-en">${esc(t.en)}</div><div class="term-zh">${esc(t.zh)}</div><div class="term-note">${esc(t.note)}</div></div>`).join('')
    : '<div class="muted">这篇论文没有可提取的专业术语。</div>';
  $('btn-refs').textContent = `检查这篇论文的参考文献（${lastRefs.length} 条）`;
  $('read-meta').hidden = false;
  $('summary-quick').hidden = false;
  $('summary-full').hidden = false;
  $('summary-terms').hidden = false;
  $('read-actions').hidden = false;
  ['quick-wait', 'full-wait', 'terms-wait'].forEach(id => { $(id).hidden = true; });
  similar.render(s);
}

function readTab(t) {
  document.querySelectorAll('#screen-read .tab').forEach(el => el.classList.toggle('on', el.dataset.tab === t));
  ['orig', 'quick', 'full', 'terms', 'similar'].forEach(n => { $('tab-' + n).hidden = n !== t; });
  $('pv-nav').hidden = t !== 'orig';
  if (t === 'similar') similar.onTabOpen();
  if (t !== 'orig') preview.hideSheet();
}
function goCiteFromPdf() {
  if (!lastRefs.length) { toast('这篇 PDF 没找到参考文献段'); return; }
  $('cite-input').value = lastRefs.map((s, i) => '[' + (i + 1) + '] ' + s).join('\n');
  go('cite');
  runCite();
}
function copySummary() {
  const s = $('r-oneline').textContent;
  const txt = ['【一句话】' + s, '【问题】' + $('r-problem').textContent, '【方法】' + $('r-method').textContent,
    '【数据】' + $('r-data').textContent].join('\n');
  copy(txt, '速读结果已复制');
}

/* ================= 学术翻译 ================= */
async function runTranslate() {
  const text = $('tr-input').value.trim();
  if (text.length < 5) { toast('请先粘贴英文段落'); return; }
  $('tr-result').innerHTML = '<div class="card center"><div class="spinner"></div><div class="muted" style="margin-top:8px">正在抽取术语并翻译…</div></div>';
  try {
    const d = await translate(text);
    let html = `<div class="card"><div class="card-title">术语表（${d.terms.length}）</div>` +
      d.terms.map(t => `<div class="term-row"><span>${esc(t.en)}</span><span class="zh">${esc(t.zh)}</span></div>`).join('') + '</div>';
    d.segments.forEach(s => {
      html += `<div class="card"><div class="card-title">译文</div><div class="dst">${esc(s.dst)}</div>
        <div class="divider"></div><div class="src-label">原文</div><div class="src">${esc(s.src)}</div></div>`;
    });
    html += `<div class="btn btn-primary" onclick="DA.copyAllTranslate()">复制全部译文</div>`;
    $('tr-result').innerHTML = html;
    $('tr-result').dataset.full = d.segments.map(s => s.dst).join('\n');
  } catch (e) {
    $('tr-result').innerHTML = `<div class="card"><div class="card-title err">出错了</div><div class="muted">${esc(e.message)}</div></div>`;
  }
}
function copyAllTranslate() { copy($('tr-result').dataset.full || '', '译文已复制'); }

/* ================= 设置 ================= */
async function testKey() {
  const v = ($('key-input').value || '').trim() || store.key;
  if (!v) { toast('请先粘贴 Key'); return; }
  $('key-test').textContent = '测试中…';
  const r = await verifyKey(v);
  if (r.ok) {
    const models = (r.models || []).filter(m => /deepseek/i.test(m)).slice(0, 3).join('、');
    $('key-test').innerHTML = '<span class="ok">连接成功</span>' + (models ? '　可用模型：' + models : '');
  } else {
    $('key-test').innerHTML = '<span class="err">' + esc(r.error || '校验失败') + '</span>';
  }
}
function saveKey() {
  const v = ($('key-input').value || '').trim();
  if (!v) { toast('请先粘贴 Key'); return; }
  if (!/^sk-[A-Za-z0-9_\-]{16,}$/.test(v)) { toast('Key 格式不对：应以 sk- 开头'); return; }
  store.key = v;
  $('key-input').value = '';
  renderKey();
  toast('已保存到本机');
  // 刚配置好 Key、且当前有一篇还没生成速读的论文时，顺手补上
  if (lastPdfFile && !$('read-main').hidden && !summaryDone) {
    const t = ++readToken;
    setBanner('', '速读生成中，可先看原文…');
    runSummary(lastPdfFile, t);
  }
}
function clearKey() {
  store.key = '';
  renderKey();
  toast('已清除本机 Key');
}

function saveBase() {
  const v = ($('base-input').value || '').trim();
  if (v && !/^https?:\/\//.test(v)) { toast('地址需以 http(s):// 开头'); return; }
  store.base = v;
  $('base-input').value = '';
  toast(v ? '接口地址已保存' : '已恢复默认接口');
}

function renderBase() {
  const el = $('base-input');
  if (el) el.placeholder = store.base;
}

/* ================= 论文阅读预览 ================= */
const preview = createPreview({ toast, esc, copy });
const similar = createSimilarSearch({ toast, esc, copy });

/* ---------------- 启动 ---------------- */
window.DA = {
  go, back, runCite, fixAll, copyList, copyBib, copyOne, clearCite, toggleItem,
  loadSample: () => { $('cite-input').value = SAMPLE; runCite(); },
  loadSampleEn: () => { $('cite-input').value = SAMPLE_EN; runCite(); },
  onPickFile, readTab, goCiteFromPdf, copySummary, runTranslate, copyAllTranslate,
  testKey, saveKey, clearKey, saveBase,
  copyText: (text, msg) => copy(text, msg),
  /* 仅用于自测：传入 ArrayBuffer，返回解析与文献抽取结果 */
  pdfTest: async (buf) => {
    const pdf = await pdfToText(buf);
    const refs = extractReferenceSection(pdf.text).entries;
    return { pages: pdf.pages, chars: pdf.chars, scanned: pdf.scanned, refs: refs.length, first: refs[0] || '' };
  }
};

renderStats();
renderKey();
renderBase();
go('home', false);
