/**
 * refsection.js —— PDF 文本清洗与参考文献段落抽取（纯字符串操作，无 Node API）
 * Node 端测试与浏览器端（Android 壳）共用同一份实现。
 */

/** 清洗 PDF 文本：去页码行、断词连字符、多余空白 */
function cleanText(raw) {
  let t = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/-\n(?=[a-z])/g, '')            // 英文断词连字符
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  t = t.split('\n').filter(line => {
    const s = line.trim();
    if (!s) return true;
    if (/^[\dIl|]{1,6}$/.test(s)) return false;
    if (/^(page|Page)\s*\d+\s*(of\s*\d+)?$/.test(s)) return false;
    return true;
  }).join('\n');
  return t.trim();
}

/** 从全文里找出参考文献段落，并按编号切成一条条 */
function extractReferenceSection(text) {
  const t = String(text || '');
  const re = /(^|\n)[ \t]*(参考文献|引用文献|References|REFERENCES|Bibliography|参考文献表)[ \t]*[:：]?[ \t]*\n?/g;
  let last = null, m;
  while ((m = re.exec(t))) last = m;
  if (!last) return { found: false, section: '', entries: [] };
  const section = t.slice(last.index + last[0].length);
  const body = section.slice(0, 8000);
  const entries = [];
  const parts = body.split(/\n\s*(?=\[\d+\])|\n\s*(?=\d{1,3}[.、)]\s)/);
  const stripNo = s => s.replace(/^\s*(\[\d+\]|\d{1,3}[.、)])\s*/, '').trim();
  for (const part of parts) {
    const s = stripNo(part.replace(/\s+/g, ' ').trim());
    if (s.length < 20) continue;
    if (!/[\u4e00-\u9fa5]/.test(s) && !/^[A-Z]/.test(s)) continue;
    entries.push(s);
  }
  if (entries.length === 0) {
    for (const line of body.split('\n')) {
      const s = line.replace(/\s+/g, ' ').trim();
      if (s.length >= 25) entries.push(s);
    }
  }
  return { found: true, section: body.slice(0, 4000), entries: entries.slice(0, 80) };
}

/** 判断文本是否像扫描版（文本层过少） */
function looksScanned(text, pages) {
  const chars = String(text || '').replace(/\s/g, '').length;
  return chars < Math.max(80, (pages || 1) * 40);
}

module.exports = { cleanText, extractReferenceSection, looksScanned };
