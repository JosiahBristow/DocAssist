/**
 * 本地论文库的纯函数测试（IndexedDB 部分需要浏览器，这里只测容量策略与时间显示）
 * 运行：node test/test-library.js
 */
const lib = require('../shared/library.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('=== 容量策略 ===');
const items = [
  { fp: 'a', size: 10, openedAt: 5 },
  { fp: 'b', size: 10, openedAt: 4 },
  { fp: 'c', size: 10, openedAt: 3 },
  { fp: 'd', size: 10, openedAt: 2 }
];
ok('未超限不删除', lib.pickExpired(items, 6, 1000).length === 0);
ok('超过数量删最旧', JSON.stringify(lib.pickExpired(items, 2, 1000)) === '["c","d"]');
ok('超过总大小删最旧', JSON.stringify(lib.pickExpired(items, 6, 25)) === '["c","d"]');
ok('空列表安全', lib.pickExpired([], 6, 1000).length === 0);
ok('排序不影响新记录', lib.pickExpired(items, 4, 1000).indexOf('a') === -1);

console.log('=== 时间显示 ===');
const now = new Date('2026-10-31T12:00:00').getTime();
ok('刚刚', lib.relativeTime(now - 30 * 1000, now) === '刚刚');
ok('分钟', lib.relativeTime(now - 5 * 60000, now) === '5 分钟前');
ok('小时', lib.relativeTime(now - 3 * 3600000, now) === '3 小时前');
ok('天', lib.relativeTime(now - 2 * 86400000, now) === '2 天前');
ok('超过一周显示日期', /月/.test(lib.relativeTime(now - 10 * 86400000, now)));

console.log('=== 导出接口 ===');
['save', 'list', 'get', 'touch', 'remove'].forEach(fn => ok('导出 ' + fn, typeof lib[fn] === 'function'));
ok('默认上限 6 篇', lib.MAX_COUNT === 6);

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) : '✅ 全部通过 (' + pass + ')'));
process.exit(fail ? 1 : 0);
