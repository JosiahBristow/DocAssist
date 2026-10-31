/**
 * color.js —— 画笔颜色工具（sRGB / HSV / HSL + WCAG 对比度）
 *
 * 颜色统一以 sRGB 十六进制存储；提供 HSV/HSL 转换用于自定义调色，
 * 并提供 WCAG 2.x 相对亮度/对比度计算，确保笔迹在白纸上清晰可辨。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PenColor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v =>
      Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
    ).join('').toUpperCase();
  }

  function channel(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(rgb) {
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  /** WCAG 对比度：(L1 + 0.05) / (L2 + 0.05) */
  function contrastRatio(hexA, hexB) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB || '#FFFFFF');
    if (!a || !b) return 1;
    const la = luminance(a), lb = luminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max ? (d / max) * 100 : 0, v: max * 100 };
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s /= 100; v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const l = (max + min) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return { h: h, s: s * 100, l: l * 100 };
  }

  function hexToHsv(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : { h: 0, s: 0, v: 0 };
  }

  function hexToHsl(hex) {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : { h: 0, s: 0, l: 0 };
  }

  function hsvToHex(h, s, v) {
    const rgb = hsvToRgb(h, s, v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  /** 逐步降低明度，直到与背景的对比度达标（默认白纸 4.5:1） */
  function ensureContrast(hex, bg, min) {
    const bgc = bg || '#FFFFFF';
    const threshold = min == null ? 4.5 : min;
    const hsv = hexToHsv(hex);
    const rgb0 = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    let out = rgbToHex(rgb0.r, rgb0.g, rgb0.b);
    let guard = 0;
    while (contrastRatio(out, bgc) < threshold && hsv.v > 8 && guard < 100) {
      hsv.v = Math.max(8, hsv.v - 2);
      out = hsvToHex(hsv.h, hsv.s, hsv.v);
      guard++;
    }
    return out;
  }

  // 预设色板：均已校验与白纸对比度 ≥ 4.5:1
  const PALETTE = ['#B03A2E', '#1F3A5F', '#1E5A3C', '#5B3A8E', '#8A5A00', '#333333'];

  return {
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    luminance: luminance,
    contrastRatio: contrastRatio,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
    rgbToHsl: rgbToHsl,
    hexToHsv: hexToHsv,
    hexToHsl: hexToHsl,
    hsvToHex: hsvToHex,
    ensureContrast: ensureContrast,
    PALETTE: PALETTE
  };
});
