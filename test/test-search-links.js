/**
 * 相似论文检索的链接与结果归一化测试（不依赖网络）
 * 运行：node test/test-search-links.js
 */
const sl = require('../shared/search-links.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('=== 检索词 ===');
const q1 = sl.buildQueries('Retrieval-Augmented Generation', ['RAG', '检索增强', '稠密检索']);
ok('优先用关键词', q1.cn === 'RAG 检索增强 稠密检索');
ok('英文检索用标题', q1.en === 'Retrieval-Augmented Generation');
const q2 = sl.buildQueries('只有标题', []);
ok('没有关键词时回退标题', q2.cn === '只有标题');

console.log('=== 平台链接 ===');
const links = sl.platformLinks('检索 增强');
ok('包含 5 个平台', links.length === 5);
ok('包含知网/万方/维普/百度', ['cnki', 'wanfang', 'cqvip', 'baidu'].every(id => links.some(l => l.id === id)));
ok('检索词已编码', links[0].url.includes(encodeURIComponent('检索 增强')));
ok('链接均为 https', links.every(l => /^https:\/\//.test(l.url)));

console.log('=== OpenAlex 归一化 ===');
const oa = sl.normalizeOpenAlex({
  title: 'A Paper',
  publication_year: 2025,
  doi: 'https://doi.org/10.1000/xyz',
  cited_by_count: 12,
  authorships: [{ author: { display_name: 'Alice' } }, { author: { display_name: 'Bob' } }],
  primary_location: { source: { display_name: 'Journal X' } },
  best_oa_location: { pdf_url: 'https://example.com/a.pdf' },
  abstract_inverted_index: { Hello: [0], world: [1], again: [2] }
});
ok('标题', oa.title === 'A Paper');
ok('作者', oa.authors.join(',') === 'Alice,Bob');
ok('年份/被引', oa.year === 2025 && oa.citations === 12);
ok('DOI 去前缀', oa.url === 'https://doi.org/10.1000/xyz');
ok('摘要还原顺序', oa.abstract === 'Hello world again');
ok('PDF 链接', oa.pdf === 'https://example.com/a.pdf');

const noPdf = sl.normalizeOpenAlex({ title: 'T', best_oa_location: { pdf_url: 'https://example.com/landing' } });
ok('非 PDF 链接不显示 PDF', noPdf.pdf === '');

console.log('=== Crossref 归一化 ===');
const cr = sl.normalizeCrossref({
  title: ['Crossref Paper'],
  author: [{ given: 'Carol', family: 'Chen' }],
  issued: { 'date-parts': [[2023]] },
  'container-title': ['Conf Y'],
  abstract: '<jats:p>An <jats:italic>abstract</jats:italic>.</jats:p>',
  URL: 'https://example.com/cr',
  'is-referenced-by-count': 5
});
ok('标题/作者', cr.title === 'Crossref Paper' && cr.authors[0] === 'Carol Chen');
ok('年份/期刊', cr.year === 2023 && cr.venue === 'Conf Y');
ok('摘要去标签', cr.abstract === 'An abstract .');
ok('列表过滤空标题', sl.normalizeList([{ title: 'ok' }, { title: '' }], 'openalex').length === 1);

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) : '✅ 全部通过 (' + pass + ')'));
process.exit(fail ? 1 : 0);
