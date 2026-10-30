/**
 * 原文预览的标注存储 / Markdown 导出回归测试（不依赖浏览器）
 * 运行：node test/test-annotations.js
 */
const pc = require('../shared/preview-core.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

function memStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

const bytes = new Uint8Array(5000);
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 255;

console.log('=== 文件指纹 ===');
const fp1 = pc.fingerprintFromBytes('paper.pdf', bytes);
const fp2 = pc.fingerprintFromBytes('paper.pdf', bytes);
const fp3 = pc.fingerprintFromBytes('other.pdf', bytes);
const fp4 = pc.fingerprintFromBytes('paper.pdf', new Uint8Array([1, 2, 3]));
ok('同文件指纹稳定', fp1 === fp2);
ok('不同文件名指纹不同', fp1 !== fp3);
ok('不同内容指纹不同', fp1 !== fp4);

console.log('=== 标注存取 ===');
const store = pc.createStore(memStorage());
const a1 = store.add(fp1, {
  page: 2,
  text: 'retrieval-augmented generation',
  note: '检索增强生成',
  rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }],
  name: 'paper.pdf'
});
ok('新增后计数为 1', store.count(fp1) === 1);
ok('返回项带 id 与页码', !!a1.id && a1.page === 2);
store.add(fp1, { page: 1, text: 'second', rects: [{ x: 0, y: 0, w: 0.5, h: 0.03 }] });
ok('新增后计数为 2', store.count(fp1) === 2);
store.update(fp1, a1.id, { note: '改过的备注' });
const loaded = store.load(fp1);
ok('备注已更新', loaded.items.find(x => x.id === a1.id).note === '改过的备注');
ok('不同文件互不影响', store.count('another-file') === 0);

console.log('=== Markdown 导出 ===');
const md = pc.toMarkdown({ name: 'paper.pdf', items: loaded.items });
ok('包含文档标题', md.includes('# 论文标注：paper.pdf'));
ok('按页码分组', md.indexOf('## 第 1 页') < md.indexOf('## 第 2 页'));
ok('包含高亮原文', md.includes('retrieval-augmented generation'));
ok('包含备注', md.includes('备注：改过的备注'));
ok('空标注也有提示', pc.toMarkdown({ name: 'x.pdf', items: [] }).includes('暂无标注'));

console.log('=== 删除与清空 ===');
store.remove(fp1, a1.id);
ok('删除一处后计数为 1', store.count(fp1) === 1);
store.clear(fp1);
ok('清空后计数为 0', store.count(fp1) === 0);

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) : '✅ 全部通过 (' + pass + ')'));
process.exit(fail ? 1 : 0);
