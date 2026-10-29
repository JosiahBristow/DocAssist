/**
 * measure_refs.js —— 用真实的参考文献表产出可写进说明书的实测数据
 * 用法：node scripts/measure_refs.js 论文1.txt 论文2.txt ...
 *       每个文件放一份文献表（从 Word 里直接复制的整段即可，一行一条）
 */
const fs = require('fs');
const gb = require('../shared/gb7714.js');

const files = process.argv.slice(2);
if (!files.length) {
  console.log('用法: node scripts/measure_refs.js 论文1.txt [论文2.txt ...]');
  process.exit(1);
}

let totalEntries = 0, badEntries = 0, perPaper = [];
const byRule = {};

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const r = gb.checkText(text, { sort: false, dedupe: true });
  totalEntries += r.total;
  badEntries += r.errCount;
  perPaper.push({ file: f, total: r.total, bad: r.errCount, passRate: r.passRate });
  for (const it of r.items) {
    for (const p of it.problems) {
      if (p.id === 'R19') continue;   // 重复条目单独统计
      byRule[p.id] = (byRule[p.id] || 0) + 1;
    }
  }
  console.log(`${f}: ${r.total} 条，问题 ${r.errCount} 条，通过率 ${r.passRate}%`);
}

const avgBad = perPaper.length ? (badEntries / perPaper.length) : 0;
const ratio = totalEntries ? (badEntries / totalEntries * 100) : 0;
console.log('\n==== 汇总（可直接写进说明书） ====');
console.log(`论文份数：${files.length}`);
console.log(`文献总条数：${totalEntries}`);
console.log(`存在问题条数：${badEntries}（占 ${ratio.toFixed(1)}%）`);
console.log(`平均每份需修改：${avgBad.toFixed(1)} 条`);
console.log('问题类型分布（按规则命中次数）：');
Object.entries(byRule).sort((a, b) => b[1] - a[1]).forEach(([id, n]) => {
  const r = gb.RULES.find(x => x.id === id);
  console.log(`  ${id} ${r ? r.rule : ''} —— ${n} 次`);
});
console.log('\n提示：把上面的数字替换说明书「1.2」与 PPT 第 2 页里的占位数据。');
