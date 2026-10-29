const g = require('../shared/gb7714.js');

const cases = [
  { name: '规范期刊', text: '王启志, 张三. 基于大模型的文献摘要生成方法[J]. 计算机应用, 2023, 43(5): 12-19.' },
  { name: '全角标点+波浪号+空格+无句点', text: '李四，王五. 深度学习综述 [J]. 计算机学报，2020，43（6）：1001～1020' },
  { name: '规范专著', text: '周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.' },
  { name: '规范学位论文', text: '张三. 面向校园场景的智能问答系统研究[D]. 长沙: 国防科技大学, 2023.' },
  { name: '电子资源缺引用日期', text: 'OpenAI. GPT-4 Technical Report[EB/OL]. https://arxiv.org/abs/2303.08774' },
  { name: '英文5作者未用et al', text: 'Vaswani A, Shazeer N, Parmar N, Uszkoreit J, Jones L. Attention is all you need[C]. Advances in Neural Information Processing Systems, 2017: 5998-6008.' },
  { name: '专著缺出版地', text: '李航. 统计学习方法[M]. 2019.' },
  { name: '期刊缺卷期页码', text: '刘洋. 大语言模型在教育中的应用[J]. 中国远程教育, 2023.' }
];

for (const c of cases) {
  const r = g.checkOne(c.text);
  console.log('\n=== ' + c.name + ' | score ' + r.score + ' | 类型 ' + (r.typeName || '未识别'));
  console.log('  题名: ' + JSON.stringify(r.title));
  console.log('  作者: ' + JSON.stringify(r.authors));
  console.log('  问题: ' + (r.problems.length ? r.problems.map(p => p.level + ':' + p.id + ' ' + p.rule).join(' | ') : '无'));
  console.log('  修正后: ' + r.fixed);
}

// 批量 + 查重 + 排序
const batch = `[1] 王启志, 张三. 基于大模型的文献摘要生成方法[J]. 计算机应用, 2023, 43(5): 12-19.
[2] 周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.
[3] 王启志, 张三. 基于大模型的文献摘要生成方法[J]. 计算机应用, 2023, 43(5): 12-19.
[4] 李四，王五. 深度学习综述 [J]. 计算机学报，2020，43（6）：1001～1020`;
const r = g.checkText(batch, { sort: true });
console.log('\n=== 批量 ===');
console.log(r.summary, '| passRate', r.passRate);
r.items.forEach(it => console.log(`  第${it.index + 1}条 -> ${it.score}分 ${it.stats.errs}E/${it.stats.warns}W ${it.duplicateOf ? '(重复于' + it.duplicateOf + ')' : ''}`));
console.log('\n--- 参考文献表 ---\n' + g.toReferenceList(r.items));
console.log('\n--- BibTeX ---\n' + g.toBibTeX(r.items.slice(0, 2)));
