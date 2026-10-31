/**
 * gb7714.js —— 参考文献格式校验与自动修正（GB/T 7714-2015 顺序编码制）
 * 纯规则引擎：不依赖网络、不依赖大模型，可在浏览器 / Node 端直接运行。
 *
 * 设计原则：只对"标准明确规定"的项报错，避免把不同期刊的格式习惯误判为错误。
 */

const conv = require('./refconvert.js');

const TYPES = {
  J:  { name: '期刊文章',  kind: 'journal' },
  M:  { name: '专著',      kind: 'book' },
  D:  { name: '学位论文',  kind: 'thesis' },
  C:  { name: '论文集',    kind: 'proceedings' },
  A:  { name: '析出文献',  kind: 'chapter' },
  N:  { name: '报纸文章',  kind: 'newspaper' },
  R:  { name: '报告',      kind: 'report' },
  S:  { name: '标准',      kind: 'standard' },
  P:  { name: '专利',      kind: 'patent' },
  G:  { name: '汇编',      kind: 'book' },
  Z:  { name: '其他',      kind: 'misc' },
  EB: { name: '电子资源',  kind: 'electronic' },
  DB: { name: '数据库',    kind: 'electronic' },
  CP: { name: '计算机程序', kind: 'electronic' },
  DS: { name: '数据集',    kind: 'electronic' }
};

const TAG_RE = /\[\s*(J|M|D|C|A|N|R|S|P|G|Z|EB|DB|CP|DS)\s*(\/\s*OL)?\s*\]/i;

const CN_RE = /[\u4e00-\u9fa5]/;
const URL_RE = /https?:\/\/[^\s，。；]+/i;

/* ---------------- 工具 ---------------- */

function normalizeRaw(s) {
  return String(s || '')
    .replace(/\u3000/g, ' ')
    .replace(/．/g, '.')
    .replace(/。/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNumbering(s) {
  return s.replace(/^\s*(\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*[.、)]|[①-⑳])\s*/, '').trim();
}

function looksLikeStart(line) {
  if (/^\s*(\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*[.、)]|[①-⑳])/.test(line)) return true;
  // 一行本身就是一个完整条目：含类型标识且以句点收尾
  return TAG_RE.test(line);
}

/** 无编号、无类型标识的外文文献表：一行一条，按行切分 */
function looksUnnumberedForeignList(lines) {
  const sample = lines.filter(l => l.trim().length > 20).slice(0, 20);
  if (sample.length < 2) return false;
  const numbered = sample.filter(l => /^\s*(\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*[.、)])/.test(l)).length;
  if (numbered > sample.length * 0.3) return false;
  const tagged = sample.filter(l => TAG_RE.test(l)).length;
  if (tagged > sample.length * 0.3) return false;
  const foreignish = sample.filter(l =>
    /\b(18|19|20)\d{2}\b/.test(l) && /\p{Lu}/u.test(l) && !/[\u4e00-\u9fa5]/.test(l)).length;
  return foreignish >= sample.length * 0.6;
}

/** 把用户粘贴的整段文字切成一条条文献 */
function splitEntries(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
    .map(l => l.trim()).filter(Boolean);
  // 一行一条的外文文献表：不做合并
  if (looksUnnumberedForeignList(lines)) {
    return lines.map(stripNumbering).filter(e => e.length > 8);
  }

  const entries = [];
  let buf = '';
  for (const line of lines) {
    if (!buf) { buf = line; continue; }
    if (looksLikeStart(line)) { entries.push(buf); buf = line; }
    else buf += ' ' + line;
  }
  if (buf) entries.push(buf);
  return entries.map(stripNumbering).filter(e => e.length > 8);
}

/* ---------------- 解析 ---------------- */

function parseEntry(raw) {
  const original = normalizeRaw(raw);
  // 抽出 URL，避免按句点切分时被 URL 里的点打断
  const urls = [];
  let s = original.replace(URL_RE, m => { urls.push(m); return `\u0000U${urls.length - 1}\u0000`; });
  s = s.replace(/\.(\s|$)/g, '. ');
  const segs = s.split(/\.\s+/).map(x => x.trim()).filter(Boolean);
  s = s;

  const tagMatch = original.match(TAG_RE);
  const tagRaw = tagMatch ? tagMatch[1].toUpperCase() : '';
  const online = tagMatch ? !!tagMatch[2] : false;

  // 定位题名段：第一个含类型标识的段；若无标识，取第 2 段
  let titleIdx = segs.findIndex(seg => TAG_RE.test(seg));
  if (titleIdx < 0) titleIdx = segs.length > 1 ? 1 : 0;

  const authorsRaw = titleIdx > 0 ? segs.slice(0, titleIdx).join('. ') : '';
  const titleRaw = segs[titleIdx] || '';
  let block = segs.slice(titleIdx + 1).join('. ');
  // 还原 URL
  block = block.replace(/\u0000U(\d+)\u0000/g, (_, i) => urls[+i] || '');
  const titleNoTag = normalizeRaw(titleRaw.replace(TAG_RE, '').trim());

  return {
    raw: original,
    original,
    tag: tagRaw,
    online,
    typeName: TYPES[tagRaw] ? TYPES[tagRaw].name : '',
    kind: TYPES[tagRaw] ? TYPES[tagRaw].kind : 'unknown',
    authorsRaw,
    authors: splitAuthors(authorsRaw),
    title: titleNoTag,
    block,
    url: (original.match(URL_RE) || [''])[0],
    year: extractYear(block) || extractYear(original),
    hasCn: CN_RE.test(original)
  };
}

function splitAuthors(a) {
  const t = normalizeRaw(a).replace(/[.．]\s*$/, '');
  if (!t) return [];
  if (/^\s*等\s*$/.test(t)) return [];
  return t.split(/[,，;；]\s*|\s{2,}/).map(x => x.trim())
    .filter(x => x && !/^(等|et\s*al\.?)$/i.test(x));
}

function extractYear(s) {
  const m = String(s).match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : '';
}

/* ---------------- 规则集 ---------------- */

const RULES = [
  {
    id: 'R01', level: 'error', rule: '缺少文献类型标识',
    test: p => !p.tag,
    hint: '题名后须紧跟 [J]/[M]/[D]/[C]/[A]/[EB/OL] 等类型标识，如"深度学习综述[J]"'
  },
  {
    id: 'R02', level: 'error', rule: '作者超过 3 人未用"等/et al."',
    test: p => p.authors.length > 3 && !/(^|[\s,，])等|et\s*al/i.test(p.authorsRaw),
    hint: 'GB/T 7714-2015：作者 ≤3 全部列出，>3 只列前 3 位，后加", 等"（外文加", et al."）',
    fix: p => {
      const keep = p.authors.slice(0, 3).join(', ');
      const tail = p.hasCn ? ', 等' : ', et al';
      return replaceAuthors(p.raw, p.authorsRaw, keep + tail);
    }
  },
  {
    id: 'R03', level: 'warn', rule: '作者之间用了全角逗号',
    test: p => p.authorsRaw.includes('，'),
    hint: '著录项目内部使用半角标点：中文作者之间也用 ", "',
    fix: p => replaceAuthors(p.raw, p.authorsRaw, p.authorsRaw.replace(/，/g, ', '))
  },
  {
    id: 'R04', level: 'info', rule: '作者仅 3 人却用了"等"',
    test: p => p.authors.length > 0 && p.authors.length <= 3 && /(^|[\s,，])等|et\s*al/i.test(p.authorsRaw),
    hint: '3 人以内应全部列出，不加"等"'
  },
  {
    id: 'R05', level: 'error', rule: '缺少题名',
    test: p => !p.title || p.title.length < 2,
    hint: '格式应为"作者. 题名[类型标识]. 出版信息."'
  },
  {
    id: 'R06', level: 'error', rule: '类型标识前有空格或类型标识不规范',
    test: p => /\s+\[\s*(J|M|D|C|A|N|R|S|P|G|Z|EB)\s*(\/\s*OL)?\s*\]/i.test(p.raw),
    hint: '题名与类型标识之间不加空格：写成"题名[J]"而不是"题名 [J]"',
    fix: p => p.raw.replace(/\s+\[\s*(J|M|D|C|A|N|R|S|P|G|Z|EB)\s*(\/\s*OL)?\s*\]/i,
      (m, t, ol) => '[' + t.toUpperCase() + (ol ? '/OL' : '') + ']')
  },
  {
    id: 'R07', level: 'error', rule: '期刊文章缺少卷(期)',
    test: p => p.kind === 'journal'
      && !/\d+\s*[(（]\s*[^)）]+\s*[)）]/.test(p.block)
      && !/[，,]\s*\d+\s*[，,:：]/.test(p.block),
    hint: '期刊格式：刊名, 年, 卷(期): 起止页码. 如"计算机学报, 2020, 43(5): 1-12."'
  },
  {
    id: 'R08', level: 'warn', rule: '期刊文章缺少页码',
    test: p => p.kind === 'journal' && !/[:：]\s*\d+\s*[-–—~～]\s*\d+/.test(p.block),
    hint: '页码范围写成"12-25"，单个页码写"12"'
  },
  {
    id: 'R09', level: 'warn', rule: '页码区间使用了 ~ 或长破折号',
    test: p => /[:：]\s*\d+\s*[~～—–]\s*\d+/.test(p.raw) && !/[:：]\s*\d+\s*-\s*\d+/.test(p.raw),
    hint: 'GB/T 7714 用半角连字符"-"表示页码范围',
    fix: p => p.raw.replace(/([:：]\s*\d+)\s*[~～—–]\s*(\d+)/g, '$1-$2')
  },
  {
    id: 'R10', level: 'error', rule: '专著缺少出版地或出版者',
    test: p => p.kind === 'book' && !/:\s*[^,，]{2,}\s*[,，]\s*((19|20)\d{2})/.test(p.block),
    hint: '专著格式：出版地: 出版者, 年份. 如"北京: 科学出版社, 2019."'
  },
  {
    id: 'R11', level: 'error', rule: '学位论文缺少保存地或保存单位',
    test: p => p.kind === 'thesis' && !/:\s*[^,，]{2,}\s*[,，]\s*((19|20)\d{2})/.test(p.block),
    hint: '学位论文格式：保存地: 保存单位, 年份. 如"长沙: 国防科技大学, 2023."'
  },
  {
    id: 'R12', level: 'error', rule: '电子资源缺少引用日期',
    test: p => p.kind === 'electronic' && !/\[\s*\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s*\]/.test(p.raw),
    hint: '格式：(更新日期)[引用日期]. 获取路径. 如"(2023-05-01)[2026-10-28]. https://..."',
    fix: p => {
      const today = new Date();
      const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (/\(\s*\)/.test(p.raw)) return p.raw.replace(/\(\s*\)/, `()[${d}]`);
      return p.raw.replace(/(\]\.?\s*)/, `$1[${d}]. `).replace(/\.\s*\./g, '.');
    }
  },
  {
    id: 'R13', level: 'error', rule: '电子资源缺少获取路径(URL/DOI)',
    test: p => p.kind === 'electronic' && !p.url && !/doi/i.test(p.raw),
    hint: '电子资源须给出可访问的 URL 或 DOI'
  },
  {
    id: 'R14', level: 'warn', rule: '未能识别年份',
    test: p => !p.year,
    hint: '每条文献都应有出版年（4 位数字）'
  },
  {
    id: 'R15', level: 'error', rule: '年份不在合理范围',
    test: p => p.year && (+p.year > new Date().getFullYear() + 1 || +p.year < 1800),
    hint: '出版年应为 4 位数字且不超过当前年份'
  },
  {
    id: 'R16', level: 'warn', rule: '使用了全角冒号/逗号',
    test: p => /[：，；]/.test(p.raw.replace(/[\u4e00-\u9fa5][，：；]/g, m => m)),
    hint: '参考文献著录用半角标点（URL 内部除外）',
    fix: p => {
      // 只替换"非中文语境"的标点：数字/字母/括号/空格 两侧
      return p.raw
        .replace(/[（(]\s*(\d[^（()）]*?)\s*[）)]/g, '($1)')
        .replace(/([0-9A-Za-z)\]）])\s*[：:]\s*(?=[0-9A-Za-z(（\[])/g, '$1: ')
        .replace(/([0-9A-Za-z)\]）])\s*[，,]\s*(?=[0-9A-Za-z0-9(（\[])/g, '$1, ')
        .replace(/([\u4e00-\u9fa5]{2,})\s*[，,]\s*(?=\s*\d)/g, '$1, ')
        .replace(/([0-9A-Za-z)\]）])\s*；\s*/g, '$1; ');
    }
  },
  {
    id: 'R17', level: 'info', rule: '结尾标点不规范',
    test: p => !/[.。]\s*$/.test(p.raw),
    hint: '每条文献以英文句点"."收尾',
    fix: p => p.raw.replace(/\s*$/, '.')
  },
  {
    id: 'R18', level: 'info', rule: '连续空格或制表符',
    test: p => /\s{2,}/.test(p.raw),
    hint: '多余的空白会被 Word 自动排版放大',
    fix: p => p.raw.replace(/\s{2,}/g, ' ')
  }
];

function replaceAuthors(raw, oldAuthors, newAuthors) {
  if (!oldAuthors) return raw;
  const idx = raw.indexOf(oldAuthors);
  if (idx < 0) return raw;
  return raw.slice(0, idx) + newAuthors + raw.slice(idx + oldAuthors.length);
}

/* ---------------- 主流程 ---------------- */

function checkOne(raw, opts) {
  // 外文体例（ACL/IEEE）：不套国标规则，直接解析并转换为国标格式
  const style = conv.detectStyle(raw);
  if (style !== 'gb') {
    const c = conv.convertEntry(raw);
    const styleLabel = style === 'ieee' ? 'IEEE' : 'ACL/EMNLP';
    const problems = [{
      id: 'C01',
      level: 'info',
      rule: `外文参考文献体例（${styleLabel}），已自动转换为国标格式`,
      hint: '原体例：年份放在末尾、作者用 "and" 连接；已按 GB/T 7714-2015 改写为「姓 名缩写」，'
          + '超过 3 人加 et al.，并识别为' + (c.typeLabel || '其他') + '类型',
      hasFix: true
    }];
    if (c.notes && c.notes.length) {
      problems.push({
        id: 'C02', level: 'warn',
        rule: '部分字段未识别：' + c.notes.join('、'),
        hint: '转换结果对应字段留空或用了原文，建议对照原文补全',
        hasFix: false
      });
    }
    const parsed = c.parsed || {};
    const warns = problems.filter(x => x.level === 'warn').length;
    return {
      index: (opts && opts.index) || 0,
      original: conv.normalizeGlued(raw),
      fixed: c.gb || conv.normalizeGlued(raw),
      changed: !!(c.gb && c.gb !== raw),
      converted: true,
      style,
      styleLabel,
      tag: c.tag || '',
      typeName: '外文格式（' + styleLabel + '）→ ' + (c.typeLabel || '其他'),
      authors: parsed.authors || [],
      title: parsed.title || '',
      year: parsed.year || '',
      problems,
      stats: { errs: 0, warns, infos: 1 },
      score: c.score == null ? 80 : c.score,
      ok: warns === 0
    };
  }

  const p = parseEntry(raw);
  const problems = [];
  for (const r of RULES) {
    let hit = false;
    try { hit = !!r.test(p); } catch (e) { hit = false; }
    if (hit) problems.push({ id: r.id, level: r.level, rule: r.rule, hint: r.hint, hasFix: !!r.fix });
  }
  const errs = problems.filter(x => x.level === 'error').length;
  const warns = problems.filter(x => x.level === 'warn').length;
  const infos = problems.filter(x => x.level === 'info').length;
  const score = Math.max(0, 100 - errs * 20 - warns * 8 - infos * 2);

  let fixed = p.raw;
  for (const r of RULES) {
    if (!r.fix) continue;
    if (!problems.some(x => x.id === r.id)) continue;
    try { fixed = r.fix(Object.assign({}, p, { raw: fixed })); } catch (e) { /* 保底：不改 */ }
  }
  fixed = normalizeRaw(fixed);

  return {
    index: (opts && opts.index) || 0,
    original: p.raw,
    fixed,
    changed: fixed !== p.raw,
    tag: p.tag,
    typeName: p.typeName,
    authors: p.authors,
    title: p.title,
    year: p.year,
    problems,
    stats: { errs, warns, infos },
    score,
    ok: errs === 0
  };
}

/** 批量校验：切分 → 逐条校验 → 查重 → 排序（可选） */
function checkText(text, options) {
  const opt = Object.assign({ sort: false, dedupe: true }, options || {});
  const entries = splitEntries(text);
  const items = entries.map((e, i) => checkOne(e, { index: i }));

  // 查重
  if (opt.dedupe) {
    const seen = new Map();
    items.forEach(it => {
      const key = (it.authors[0] || '') + '|' + (it.title || '').slice(0, 20).replace(/\s/g, '');
      if (seen.has(key)) {
        it.duplicateOf = seen.get(key).index + 1;
        it.problems.push({
          id: 'R19', level: 'error', rule: `与第 ${seen.get(key).index + 1} 条重复`,
          hint: '同一文献被重复著录，应删除其中一条', hasFix: false
        });
        it.stats.errs += 1;
        it.score = Math.max(0, it.score - 20);
        it.ok = false;
      } else seen.set(key, it);
    });
  }

  let ordered = items;
  if (opt.sort) {
    const sorted = items.slice().sort((a, b) =>
      (a.authors[0] || '').localeCompare(b.authors[0] || '', 'zh-Hans-CN'));
    sorted.forEach((it, i) => { it.newIndex = i + 1; });
    ordered = sorted;
  }

  const total = ordered.length;
  const convertedCount = ordered.filter(x => x.converted).length;
  const errCount = ordered.filter(x => x.stats.errs > 0).length;
  const warnCount = ordered.filter(x => x.stats.errs === 0 && x.stats.warns > 0).length;
  const passRate = total ? Math.round((total - errCount) / total * 100) : 0;

  const convertedNote = convertedCount
    ? `；其中 ${convertedCount} 条为外文格式，已自动转换为国标格式`
    : '';
  const warnNote = warnCount > 0
    ? `，另有 ${warnCount} 条有字段未识别（如页码缺失），建议对照原文核对`
    : '';
  return {
    total, errCount, warnCount, passRate, convertedCount,
    items: ordered,
    summary: total === 0 ? '未识别到有效文献条目'
      : `${total} 条文献：${total - errCount} 条格式规范，${errCount} 条存在问题${opt.sort ? '（已按首作者排序）' : ''}${convertedNote}${warnNote}`
  };
}

/** 导出为可直接粘贴进 Word 的参考文献表 */
function toReferenceList(items, numbered) {
  const list = items.filter(it => !it.duplicateOf);
  return list.map((it, i) => {
    const body = (it.fixed || it.original).replace(/\s*\.?\s*$/, '.');
    return numbered === false ? body : `[${i + 1}] ${body}`;
  }).join('\n');
}

const BIBTEX_TYPE = {
  J: 'article', M: 'book', G: 'book', D: 'phdthesis', C: 'inproceedings',
  A: 'incollection', N: 'article', R: 'techreport', S: 'standard',
  P: 'patent', EB: 'misc', DB: 'misc', CP: 'misc', DS: 'misc', Z: 'misc'
};

/** 导出 BibTeX（方便直接导入 Zotero/EndNote/LaTeX） */
function toBibTeX(items) {
  return items.map((it, i) => {
    const first = (it.authors[0] || 'ref').replace(/[^\w\u4e00-\u9fa5]/g, '');
    const key = `${first}${it.year || ''}${i + 1}`;
    const type = BIBTEX_TYPE[it.tag] || 'misc';
    const fields = [];
    if (it.authors.length) fields.push(`  author = {${it.authors.join(' and ')}}`);
    if (it.title) fields.push(`  title = {${it.title}}`);
    if (it.year) fields.push(`  year = {${it.year}}`);
    if (it.url) fields.push(`  url = {${it.url}}`);
    fields.push(`  note = {原始著录: ${it.fixed || it.original}}`);
    return `@${type}{${key},\n${fields.join(',\n')}\n}`;
  }).join('\n\n');
}

module.exports = {
  TYPES, RULES, splitEntries, parseEntry, checkOne, checkText,
  toReferenceList, toBibTeX, normalizeRaw, stripNumbering
};
