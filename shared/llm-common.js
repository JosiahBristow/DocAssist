/**
 * llm-common.js —— 提示词、分块、结果归一化（纯 JS，无 Node API）
 * 同时被 Node 端（云函数 docai-core.js）与浏览器端（Android 壳 llm.js）引用，
 * 保证两端使用完全相同的提示词与字段约定，避免行为漂移。
 */

const SUMMARY_SCHEMA = `{
  "title": "论文标题（尽量还原原文语言）",
  "one_line": "一句话读懂这篇论文（不超过60字，说清做了什么、效果如何）",
  "problem": "它要解决的问题（1-2句）",
  "method": "核心方法与技术路线（2-3句，写清用了什么模型/算法/流程）",
  "data": "数据与实验设置（数据集、样本量、对比基线；没有就写'未说明'）",
  "results": ["主要结论1（尽量带数字）", "主要结论2", "主要结论3"],
  "contributions": ["创新点1", "创新点2"],
  "limitations": ["局限1", "局限2"],
  "usable": ["对读者写论文/做项目可借鉴的点1", "点2"],
  "keywords": ["关键词", "3-6个"],
  "terms": [{"en": "英文术语", "zh": "中文译名", "note": "一句话解释"}]
}`;

const SUMMARY_SYSTEM = '你是一名严谨的学术文献阅读助手，服务对象是本科生。你的任务是准确、克制地提炼论文信息：' +
  '只依据原文，不编造数据与结论；原文没写的字段填"未说明"；使用简体中文。';

const MAP_SYSTEM = '你是学术文本提炼助手。请把这一部分论文内容压缩成不超过 120 字的要点，' +
  '保留研究问题、方法、实验数据与结论中的关键事实。';

const TERM_SYSTEM = '你是学术翻译的术语工程师。请从给定英文文本中抽取 12-20 个专业术语/固定搭配，' +
  '给出该领域通用中文译名。只输出 JSON。';

const TRANSLATE_SYSTEM = '你是学术文献译者。要求：1) 忠实原意，不增删；2) 保留公式、数字、参考文献编号原样；' +
  '3) 术语必须严格采用给定译名；4) 译文为学术书面语，通顺不口语化；5) 只输出译文，不要解释。';

const SELECTION_SYSTEM = '你是学术文献的划词翻译助手。把用户选中的片段翻译成简体中文：' +
  '若为单词或术语，给出该领域通用译名，必要时附一句极简解释；若为句子，给出忠实、通顺的学术译文。' +
  '若原文是中文，则译为英文。只输出译文本身，不要引号、不要解释、不要重复原文。';

const ASSISTANT_SYSTEM = '你是文献阅读助手，服务对象是本科生。回答规则：' +
  '1) 优先依据用户提供的选中内容或图片；2) 不编造原文没有的信息，不确定就明确说明；' +
  '3) 用简体中文，先给结论，再分点解释；4) 遇到术语或公式，先用通俗语言解释再用。';

function mapPrompt(index, total, chunk) {
  return `第 ${index}/${total} 部分：\n${chunk}`;
}

function summaryPrompt(source) {
  return `请阅读下面的论文内容，按给定 JSON 结构输出。字段说明：${SUMMARY_SCHEMA}\n\n论文内容：\n${source}`;
}

function termPrompt(text) {
  return `输出结构：{"terms":[{"en":"","zh":""}]}\n\n文本：\n${String(text || '').slice(0, 6000)}`;
}

function translatePrompt(termLine, chunk) {
  return `术语表（必须遵守）：${termLine}\n\n待译文本：\n${chunk}`;
}

function selectionPrompt(text) {
  return `选中片段：\n${String(text || '').slice(0, 1200)}`;
}

function assistantPrompt(context, question) {
  const c = String(context || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  const q = String(question || '').trim();
  return (c ? `【选中内容】\n${c}\n\n` : '') + `【问题】\n${q}`;
}

/** 组装 AI 助手的消息：system + 最近 8 轮历史 + 本次问题（可带图片） */
function buildAssistantMessages(opts) {
  const o = opts || {};
  const history = Array.isArray(o.history) ? o.history.slice(-8) : [];
  const messages = [{ role: 'system', content: ASSISTANT_SYSTEM }];
  for (const m of history) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = String(m.content || '').trim();
    if (text) messages.push({ role: m.role, content: text.slice(0, 4000) });
  }
  const q = String(o.question || '').trim() || (o.image ? '请解释这张图片的内容' : '');
  if (!q) throw new Error('请先输入问题');
  const text = assistantPrompt(o.context, q);
  if (o.image && /^data:image\//.test(o.image)) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: text },
        { type: 'image_url', image_url: { url: o.image } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: text });
  }
  return messages;
}

function chunkText(text, size, overlap) {
  const s = Number(size || 3500), ov = Number(overlap || 200);
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + s));
    if (i + s >= text.length) break;
    i += s - ov;
  }
  return chunks;
}

function asList(v, max) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean).slice(0, max || 6);
  return String(v).split(/[;；\n]/).map(x => x.trim()).filter(Boolean).slice(0, max || 6);
}

function normalizeSummary(j) {
  return {
    title: String(j.title || '').trim(),
    one_line: String(j.one_line || '').trim(),
    problem: String(j.problem || '未说明').trim(),
    method: String(j.method || '未说明').trim(),
    data: String(j.data || '未说明').trim(),
    results: asList(j.results, 5),
    contributions: asList(j.contributions, 4),
    limitations: asList(j.limitations, 4),
    usable: asList(j.usable, 4),
    keywords: asList(j.keywords, 8),
    terms: Array.isArray(j.terms) ? j.terms.slice(0, 15).map(t => ({
      en: String(t.en || '').trim(), zh: String(t.zh || '').trim(), note: String(t.note || '').trim()
    })).filter(t => t.en || t.zh) : []
  };
}

function parseJsonLoose(s) {
  try { return JSON.parse(s); } catch (e) {}
  const m = String(s || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  throw new Error('模型返回内容不是合法 JSON');
}

module.exports = {
  SUMMARY_SCHEMA, SUMMARY_SYSTEM, MAP_SYSTEM, TERM_SYSTEM, TRANSLATE_SYSTEM, SELECTION_SYSTEM, ASSISTANT_SYSTEM,
  mapPrompt, summaryPrompt, termPrompt, translatePrompt, selectionPrompt,
  assistantPrompt, buildAssistantMessages,
  chunkText, asList, normalizeSummary, parseJsonLoose
};
