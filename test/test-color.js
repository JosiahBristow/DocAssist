/**
 * 画笔颜色工具测试：sRGB/HSV/HSL 转换与 WCAG 对比度
 * 运行：node test/test-color.js
 */
const c = require('../shared/color.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('=== sRGB / HSV / HSL ===');
ok('hex → rgb', JSON.stringify(c.hexToRgb('#B03A2E')) === '{"r":176,"g":58,"b":46}');
ok('rgb → hex', c.rgbToHex(176, 58, 46) === '#B03A2E');
const hsv = c.hexToHsv('#B03A2E');
ok('hex → hsv 返回三位', hsv.h > 0 && hsv.s > 0 && hsv.v > 0);
ok('hsv → hex 往返一致', c.hsvToHex(hsv.h, hsv.s, hsv.v) === '#B03A2E');
const hsl = c.hexToHsl('#1F3A5F');
ok('hsl 亮度合理', hsl.l > 20 && hsl.l < 30);
ok('短 hex 支持', JSON.stringify(c.hexToRgb('#fff')) === '{"r":255,"g":255,"b":255}');

console.log('=== WCAG 对比度 ===');
ok('黑白 21:1', Math.round(c.contrastRatio('#000000', '#FFFFFF')) === 21);
ok('同色 1:1', Math.round(c.contrastRatio('#123456', '#123456')) === 1);
ok('白纸对比度计算', c.contrastRatio('#B03A2E') > 4.5);
ok('未知颜色安全返回 1', c.contrastRatio('nope') === 1);

console.log('=== 预设色板 ===');
ok('色板 6 色', c.PALETTE.length === 6);
const low = c.PALETTE.filter(hex => c.contrastRatio(hex, '#FFFFFF') < 4.5);
ok('全部满足白纸 4.5:1', low.length === 0, low.join(','));

console.log('=== 自动加深 ===');
const fixed = c.ensureContrast('#F5D76E'); // 浅黄，白纸上不达标
ok('浅色会被加深到达标', c.contrastRatio(fixed, '#FFFFFF') >= 4.5);
ok('已达标的颜色保持不变', c.ensureContrast('#B03A2E') === '#B03A2E');

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) : '✅ 全部通过 (' + pass + ')'));
process.exit(fail ? 1 : 0);
