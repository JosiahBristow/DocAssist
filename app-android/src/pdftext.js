/**
 * pdf.js 封装：把 PDF 的 ArrayBuffer 转成清洗后的文本
 * 按 transform 纵坐标重建行结构（否则整页会挤成一行，"参考文献"标题就定位不到）
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.js';
import { cleanText, looksScanned } from '../../shared/refsection.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdf.worker.min.js';

const Y_TOL = 2.5;

/** 把一页的文本项按坐标重组成多行 */
function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.transform) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    let row = rows.find(r => Math.abs(r.y - y) <= Y_TOL);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join('').trim()).filter(Boolean);
}

export async function pdfToText(arrayBuffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    isEvalSupported: false,
    useWorkerFetch: false
  }).promise;

  const pages = [];
  const total = doc.numPages;
  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(itemsToLines(content.items).join('\n'));
  }
  const text = cleanText(pages.join('\n\n'));
  return { text, pages: total, chars: text.length, scanned: looksScanned(text, total) };
}

export { itemsToLines };
