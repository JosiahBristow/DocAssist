/**
 * pdf-export.js —— 把本机标注（高亮 + 画笔）写入原 PDF，生成标注版 PDF
 *
 * 依赖调用方注入 pdf-lib（Android 由 esbuild 打包，本地预览用 window.PDFLib），
 * 不直接引入依赖，方便两端复用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255
    };
  }

  // 高亮默认色（与阅读器里的荧光黄一致）
  var HIGHLIGHT = { r: 1, g: 0.85, b: 0.3 };

  function highlightColor(c) {
    if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) {
      var rgb = hexToRgb(c);
      if (rgb) return rgb;
    }
    return HIGHLIGHT;
  }

  /**
   * @param {object} pdfLib  pdf-lib 命名空间（含 PDFDocument / rgb / LineCapStyle）
   * @param {Uint8Array|ArrayBuffer} originalBytes 原始 PDF
   * @param {Array} annotations viewer.getAnnotations() 的结果
   * @returns {Promise<Uint8Array>}
   */
  async function exportAnnotatedPdf(pdfLib, originalBytes, annotations) {
    if (!pdfLib || !pdfLib.PDFDocument) throw new Error('PDF 导出组件未加载');
    var items = (annotations || []).filter(function (a) {
      return (a.type === 'ink' && a.points && a.points.length > 1) ||
        (a.type === 'highlight' && a.rects && a.rects.length) ||
        (!a.type && a.rects && a.rects.length);
    });
    if (!items.length) throw new Error('还没有可导出的标注');

    var doc = await pdfLib.PDFDocument.load(originalBytes, { ignoreEncryption: true });
    var pages = doc.getPages();
    var rgb = pdfLib.rgb;
    var roundCap = pdfLib.LineCapStyle ? pdfLib.LineCapStyle.Round : 1;

    items.forEach(function (a) {
      var pageIndex = Math.max(0, (Number(a.page) || 1) - 1);
      if (pageIndex >= pages.length) return;
      var page = pages[pageIndex];
      var size = page.getSize();
      var W = size.width;
      var H = size.height;

      if (a.type === 'ink') {
        var color = hexToRgb(a.color) || { r: 0.69, g: 0.23, b: 0.18 };
        var thickness = Math.max(0.6, (Number(a.width) || 0.006) * W);
        for (var i = 1; i < a.points.length; i++) {
          var p0 = a.points[i - 1];
          var p1 = a.points[i];
          page.drawLine({
            start: { x: p0[0] * W, y: H - p0[1] * H },
            end: { x: p1[0] * W, y: H - p1[1] * H },
            thickness: thickness,
            color: rgb(color.r, color.g, color.b),
            opacity: 1,
            lineCap: roundCap
          });
        }
        return;
      }

      var hc = highlightColor(a.color);
      (a.rects || []).forEach(function (r) {
        page.drawRectangle({
          x: r.x * W,
          y: H - (r.y + r.h) * H,
          width: r.w * W,
          height: r.h * H,
          color: rgb(hc.r, hc.g, hc.b),
          opacity: 0.35
        });
      });
    });

    return await doc.save();
  }

  return { exportAnnotatedPdf: exportAnnotatedPdf, hexToRgb: hexToRgb };
});
