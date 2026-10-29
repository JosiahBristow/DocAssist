/**
 * refconvert.js —— 外文参考文献体例识别与「一键转国标」
 *
 * 解决的问题：学生读的英文论文（ACL / EMNLP / NeurIPS / IEEE 体例）里，参考文献长这样：
 *   Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization.arXiv preprint arXiv:1607.06450, 2016.
 * 年份在末尾、作者用 "and" 连接、题名与出处常被 PDF 抽取黏在一起，直接套 GB/T 7714 的 18 条规则会全都报错。
 *
 * 本模块做三件事：
 *   ① 识别体例（国标 / ACL 类 / IEEE 类）
 *   ② 把外文体例解析成字段（作者、题名、出处、年、卷期页、arXiv 号）
 *   ③ 按 GB/T 7714-2015 重新生成条目（外文作者改写为「姓 名缩写」，>3 人加 et al.）
 *
 * 纯规则、零依赖，可在小程序端 / 云函数 / Node 中直接运行。
 */

const PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'di', 'da', 'dos', 'du', 'del', 'la', 'le', 'ten', 'ter', 'zu', 'bin', 'al']);
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);
const OPENERS = ['Proceedings', 'Proc', 'Advances', 'Journal', 'Conference', 'Workshop', 'Symposium', 'Pattern', 'Annual', 'International'];

const CN_RE = /[\u4e00-\u9fa5]/;
const TAG_RE = /\[\s*(J|M|D|C|A|N|R|S|P|G|Z|EB|DB|CP|DS)\s*(\/\s*OL)?\s*\]/i;

/* ---------------- 文本修复 ---------------- */

/** PDF 抽取常把「题名.出处」黏成「题名.出处」，这里补回空格；不误伤人名缩写（Quoc V. Le） */
function normalizeGlued(s) {
  let t = String(s || '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 已知的“题名.出处”黏连：.arXiv / .CoRR / .In （出处以小写或缩写开头）
  t = t.replace(/\.(?=(?:arXiv|CoRR|In\s|In[A-Z]))/g, '. ');
  // ".Layer" → ". Layer"，但 "V. Le" 前面紧跟单个大写字母时不插空格
  t = t.replace(/(?<![A-Z])\.(?=[A-Z])/g, '. ');
  // "InProceedings" / "InICLR" / "InProc." → "In Proceedings / In ICLR / In Proc."
  const openers = OPENERS.join('|');
  t = t.replace(new RegExp(`(^|[\\s.])In(?=(?:${openers}|[A-Z]{2,}|[A-Z][a-z]{3,}))`, 'g'), '$1In ');
  return t;
}

/* ---------------- 体例识别 ---------------- */

function detectStyle(raw) {
  const s = normalizeGlued(raw);
  if (TAG_RE.test(s)) return 'gb';
  // 中文条目一律走国标规则（缺 [类型] 由 R01 报错，不做外文转换）
  if (CN_RE.test(s)) return 'gb';
  // IEEE：题名带引号 + pp. 页码
  if (/[“"][^”"]{8,}[”"]/.test(s) && /\bpp?\.\s*\d/.test(s)) return 'ieee';
  // ACL 类：作者段以 ". " 结束，出处不以 [类型] 标注，常见 arXiv / CoRR / In Proceedings
  if (/\barXiv\b|CoRR|In\s+Proceedings|In\s+Proc\.|Proceedings of/i.test(s)) return 'acl';
  // 末位年份 + 无类型标识，且形如 "Name Name. Title. Venue, 2016."
  const endYear = /[,，]\s*(19|20)\d{2}\s*\.?$/.test(s);
  const nameJoin = /,\s*and\s+\p{Lu}/u.test(s);
  const titleAfterAuthors = /^[^.]{6,160}\.\s+\p{Lu}/u.test(s);
  if (/\b(19|20)\d{2}\b/.test(s) && (nameJoin || (endYear && titleAfterAuthors))) return 'acl';
  return 'gb';
}

/* ---------------- 人名处理 ---------------- */

function isNameToken(tok) {
  const t = String(tok || '').replace(/[,.]$/, '');
  if (!t) return false;
  if (/^(and|&)$/i.test(t)) return true;
  if (PARTICLES.has(t.toLowerCase())) return true;
  if (SUFFIXES.has(t.toLowerCase())) return true;
  // 首字母大写（含带重音字符），允许连字符、撇号、末尾缩写点
  return /^\p{Lu}[\p{L}'’\-]*\.?$/u.test(tok.trim()) || /^\p{Lu}\.$/u.test(tok.trim());
}

function isNameSeg(seg) {
  let s = String(seg || '').trim().replace(/\.$/, '');
  if (!s) return false;
  // 「…, et al.」这类尾部缩写不影响作者段判断
  s = s.replace(/,\s*et\s+al\.?$/i, '').trim();
  const parts = s.split(/\s*,\s*|\s+and\s+/i).filter(Boolean);
  if (!parts.length) return false;
  return parts.every(p => {
    const toks = p.trim().split(/\s+/).filter(Boolean);
    if (!toks.length || toks.length > 5) return false;
    return toks.every(isNameToken);
  });
}

function splitAuthors(seg) {
  return String(seg || '')
    .replace(/\s+and\s+/gi, ', ')
    .replace(/\s*&\s*/g, ', ')
    .split(/\s*,\s*/)
    .map(x => x.trim().replace(/\.$/, ''))
    .filter(x => x && !/^(and|&|et\s+al\.?)$/i.test(x));
}

/** "Jimmy Lei Ba" → "Ba J L"；"Bart van Merrienboer" → "van Merrienboer B" */
function toGbName(full) {
  const raw = String(full || '').trim().replace(/\.$/, '');
  if (!raw) return '';
  const toks = raw.split(/\s+/).filter(Boolean);
  if (toks.length === 1) return raw;
  // 后缀（Jr./III）提到最后
  let suffix = '';
  while (toks.length > 1 && SUFFIXES.has(toks[toks.length - 1].toLowerCase())) {
    suffix = ' ' + toks.pop().replace(/\.$/, '');
  }
  // 姓氏：末尾连续的大写词，含前置小品词（van/de/von…）
  let i = toks.length - 1;
  while (i > 0 && PARTICLES.has(toks[i - 1].toLowerCase())) i--;
  const surname = toks.slice(i).join(' ');
  const given = toks.slice(0, i);
  const initials = given.map(g => {
    const letters = g.replace(/[^\p{L}]/gu, '');
    return letters ? [...letters][0].toUpperCase() : '';
  }).filter(Boolean).join(' ');
  return initials ? `${surname} ${initials}${suffix}` : `${surname}${suffix}`;
}

/* ---------------- 解析 ---------------- */

function parseForeign(raw) {
  const notes = [];
  let s = normalizeGlued(raw).replace(/^\s*(\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*[.、)])\s*/, '').trim();
  s = s.replace(/[.。]$/, '');

  const tailYear = s.match(/[,，]\s*((18|19|20)\d{2})\s*\.?$/);
  const years = s.match(/\b(18|19|20)\d{2}\b/g) || [];
  const year = tailYear ? tailYear[1] : (years.length ? years[years.length - 1] : '');
  if (tailYear) s = s.slice(0, tailYear.index).trim().replace(/[,，]$/, '');

  // 按句点切段，再判断哪几段是作者
  const segs = s.split(/\.\s+/).map(x => x.trim()).filter(Boolean);
  let authorEnd = 0;
  if (segs.length) {
    authorEnd = 0;
    while (authorEnd < segs.length - 1 && isNameSeg(segs[authorEnd])) authorEnd++;
  }
  const authorsRaw = segs.slice(0, authorEnd).join('. ');
  const title = segs[authorEnd] || '';
  const venueRaw = segs.slice(authorEnd + 1).join('. ');
  if (!authorsRaw) notes.push('未识别到作者段');
  if (!title) notes.push('未识别到题名');

  const authors = splitAuthors(authorsRaw);
  const venue = venueRaw.replace(new RegExp(`[,，]?\\s*${year}\\s*$`), '').trim();

  // arXiv / CoRR 预印本
  let arxivId = '';
  const am = s.match(/arXiv\s*:?\s*([\d]{4}\.[\d]{4,5}(?:v\d+)?)/i) || s.match(/CoRR,?\s*abs\/([\d]{4}\.[\d]{4,5})/i);
  if (am) arxivId = am[1];

  // 页码
  let pages = '';
  const pm = venueRaw.match(/pages?\s*(\d+)\s*[–—\-]\s*(\d+)/i)
          || venueRaw.match(/:\s*(\d+)\s*[–—\-]\s*(\d+)/)
          || venueRaw.match(/,\s*(\d+)\s*[–—\-]\s*(\d+)\s*\.?$/);
  if (pm) pages = `${pm[1]}-${pm[2]}`;

  // 卷(期)
  let volume = '', issue = '';
  const vm = venueRaw.match(/(\d+)\s*\(\s*([\dA-Za-z]+)\s*\)\s*:/) || venueRaw.match(/,\s*(\d+)\s*\(\s*([\dA-Za-z]+)\s*\)/);
  if (vm) { volume = vm[1]; issue = vm[2]; }
  else {
    const vm2 = venueRaw.match(/,\s*(\d+)\s*:\s*\d+/);
    if (vm2) volume = vm2[1];
  }

  // 类型判定
  let kind = 'misc';
  let venueName = venue;
  if (arxivId) {
    kind = 'preprint';
    venueName = 'arXiv 预印本';
  } else if (/^\s*In\s+/i.test(venue) || /Proceedings|Conference|Workshop|Symposium|Proc\./i.test(venue)) {
    kind = 'conference';
    venueName = venue.replace(/^\s*In\s+/i, '')
      .replace(/,?\s*pages?\s*\d+\s*[–—\-]\s*\d+/i, '')
      .replace(/,?\s*\d+\s*[–—\-]\s*\d+\s*$/, '')
      .replace(/[,，]?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\b\.?/gi, '')
      .trim();
  } else if (volume || issue) {
    kind = 'journal';
    venueName = venue.split(/\s*,\s*/)[0].replace(/,$/, '').trim();
  } else if (/Press|Publisher|Publishing|出版/i.test(venue)) {
    kind = 'book';
  } else if (venue) {
    kind = 'journal';
    venueName = venue.split(/\s*,\s*/)[0].trim();
  }

  if (!year) notes.push('未识别到年份');
  if (!pages && (kind === 'journal' || kind === 'conference')) notes.push('未识别到页码');

  return { authors, authorsRaw, title, year, venue, venueName, kind, pages, volume, issue, arxivId, notes, raw: s };
}

/* ---------------- 生成国标条目 ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const KIND_MAP = {
  journal:    { tag: 'J', label: '期刊' },
  conference: { tag: 'C', label: '会议' },
  preprint:   { tag: 'EB', ol: true, label: '预印本' },
  book:       { tag: 'M', label: '专著' },
  misc:       { tag: 'Z', label: '其他' }
};

function toGB(parsed, opts) {
  const o = opts || {};
  const p = parsed;
  const kind = KIND_MAP[p.kind] || KIND_MAP.misc;
  const tag = kind.ol ? `[${kind.tag}/OL]` : `[${kind.tag}]`;

  let auth = p.authors.map(toGbName).filter(Boolean);
  if (auth.length > 3) auth = auth.slice(0, 3).concat('et al.');
  const authStr = auth.join(', ').replace(/\.$/, '');
  const title = String(p.title || '').replace(/\s*\.$/, '').trim();
  const year = p.year || '';
  const pages = p.pages ? (['journal', 'conference'].includes(p.kind) ? `: ${p.pages}` : `, ${p.pages}`) : '';

  let body = '';
  if (p.kind === 'journal') {
    const vol = p.volume ? `, ${p.volume}` : '';
    const iss = p.issue ? `(${p.issue})` : '';
    body = `. ${p.venueName || '未说明'}, ${year}${vol}${iss}${pages}.`;
  } else if (p.kind === 'conference') {
    body = `//${p.venueName || '未说明论文集'}. ${year}${pages}.`;
  } else if (p.kind === 'preprint') {
    const url = p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : '';
    body = `. (${year || '未说明'})[${o.citeDate || today()}]. ${url ? url + '.' : '获取路径缺失.'}`;
    return `${authStr}. ${title}[EB/OL]${body}`;
  } else {
    body = p.venueName ? `. ${p.venueName}, ${year}.` : `. ${year}.`;
  }

  return `${authStr}. ${title}${tag}${body}`
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 一条外文文献 → 国标条目 + 可信度 */
function convertEntry(raw, opts) {
  const style = detectStyle(raw);
  if (style === 'gb') {
    return { style, ok: false, reason: '已是国标体例', gb: '', parsed: null };
  }
  const parsed = parseForeign(raw);
  const missing = parsed.notes.filter(n => /作者|题名|年份/.test(n));
  const gb = toGB(parsed, opts);
  const score = Math.max(40, 100 - missing.length * 25 - (parsed.notes.length - missing.length) * 8);
  return {
    style,
    ok: !!parsed.title && !!parsed.year && parsed.authors.length > 0,
    parsed,
    gb,
    tag: (KIND_MAP[parsed.kind] || KIND_MAP.misc).tag,
    typeLabel: (KIND_MAP[parsed.kind] || KIND_MAP.misc).label,
    notes: parsed.notes,
    score,
    reason: missing.length ? '部分字段未识别：' + missing.join('、') : ''
  };
}

module.exports = {
  detectStyle, normalizeGlued, parseForeign, toGB, convertEntry,
  toGbName, splitAuthors, isNameSeg, KIND_MAP
};
