/**
 * 标注版 PDF 导出测试（pdf-lib 生成 → 写入标注 → 重新加载校验）
 * 运行：node test/test-pdf-export.js
 */
const { PDFDocument, rgb, LineCapStyle } = require('pdf-lib');
const { exportAnnotatedPdf } = require('../shared/pdf-export.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  console.log('=== 生成标注版 PDF ===');
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  page.drawText('Hello DocAssist', { x: 20, y: 360, size: 14 });
  const input = await doc.save();

  const annotations = [
    { type: 'highlight', page: 1, rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }], color: 'yellow' },
    { type: 'ink', page: 1, points: [[0.1, 0.3], [0.4, 0.4], [0.6, 0.35]], color: '#B03A2E', width: 0.006 }
  ];
  const out = await exportAnnotatedPdf({ PDFDocument, rgb, LineCapStyle }, input, annotations);

  ok('返回 Uint8Array', out instanceof Uint8Array);
  ok('以 %PDF 开头', String.fromCharCode(out[0], out[1], out[2], out[3]) === '%PDF');
  ok('输出比原文件大', out.length > input.length, input.length + ' -> ' + out.length);

  const check = await PDFDocument.load(out);
  ok('页数保持 1', check.getPageCount() === 1);

  console.log('=== 边界情况 ===');
  let threw = false;
  try { await exportAnnotatedPdf({ PDFDocument, rgb, LineCapStyle }, input, []); } catch (e) { threw = true; }
  ok('没有标注时抛错', threw);

  threw = false;
  try { await exportAnnotatedPdf(null, input, annotations); } catch (e) { threw = true; }
  ok('缺少 pdf-lib 时抛错', threw);

  const onlyPage2 = [{ type: 'highlight', page: 9, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.05 }] }];
  const out2 = await exportAnnotatedPdf({ PDFDocument, rgb, LineCapStyle }, input, onlyPage2);
  ok('越界页码安全忽略', out2.length >= input.length);

  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) : '✅ 全部通过 (' + pass + ')'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
