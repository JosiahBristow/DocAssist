/**
 * AI 助手消息组装测试（不依赖网络）
 * 运行：node test/test-assistant.js
 */
const common = require('../shared/llm-common.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('=== 消息组装 ===');
const m1 = common.buildAssistantMessages({ question: '这是什么？', context: 'dense vector index' });
ok('第一条是 system', m1[0].role === 'system' && m1[0].content === common.ASSISTANT_SYSTEM);
ok('最后一条是 user', m1[m1.length - 1].role === 'user');
ok('包含选中内容', m1[m1.length - 1].content.includes('【选中内容】\ndense vector index'));
ok('包含问题', m1[m1.length - 1].content.includes('【问题】\n这是什么？'));

const noCtx = common.buildAssistantMessages({ question: '总结一下' });
ok('无选中内容时不加前缀', !noCtx[noCtx.length - 1].content.includes('【选中内容】'));

console.log('=== 历史 ===');
const hist = [];
for (let i = 0; i < 12; i++) hist.push({ role: i % 2 ? 'assistant' : 'user', content: 'msg' + i });
const m2 = common.buildAssistantMessages({ question: '继续', history: hist });
ok('只带最近 8 条历史', m2.length === 1 + 8 + 1);
ok('保留最后一条历史', m2[m2.length - 2].content === 'msg11');
ok('忽略非法角色', common.buildAssistantMessages({
  question: 'q', history: [{ role: 'system', content: 'x' }, { role: 'user', content: 'y' }]
}).length === 3);

console.log('=== 图片 ===');
const m3 = common.buildAssistantMessages({
  question: '', image: 'data:image/jpeg;base64,AAA', context: '图 1'
});
const last = m3[m3.length - 1];
ok('图片消息使用数组内容', Array.isArray(last.content));
ok('包含 text 与 image_url', last.content[0].type === 'text' && last.content[1].type === 'image_url');
ok('无问题时默认问图片', last.content[0].text.includes('请解释这张图片的内容'));
ok('非 data URL 不按图片发送', common.buildAssistantMessages({
  question: 'q', image: 'https://x/a.png'
})[1].content.constructor === String);

console.log('=== 空问题 ===');
let threw = false;
try { common.buildAssistantMessages({ question: '  ' }); } catch (e) { threw = true; }
ok('空问题抛出错误', threw);

console.log('\n' + (fail ? '❌ ' + fail + ' 项失败 / ' + (pass + fail) : '✅ 全部通过 (' + pass + ')'));
process.exit(fail ? 1 : 0);
