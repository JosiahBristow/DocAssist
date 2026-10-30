/**
 * docai-core.js —— 文献助手核心逻辑（Node 端：云函数 / 本地预览 / CLI）
 * 依赖：Node >= 18（内置 fetch）、pdf-parse（仅 PDF 解析时需要）
 * 提示词与归一化在 shared/llm-common.js，文本清洗与文献段抽取在 shared/refsection.js，
 * 与浏览器端（app-android）共用同一份实现，避免两端行为漂移。
 */

const common = require('./llm-common.js');
const refseg = require('./refsection.js');

const BASE = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 55000);

function keyOf(opts) {
  const k = (opts && (opts.apiKey || opts.key)) || process.env.DEEPSEEK_API_KEY || '';
  return String(k).trim();
}

function baseOf(opts) {
  const b = (opts && opts.baseUrl) || BASE;
  return String(b).replace(/\/$/, '');
}

function hasKey(opts) { return !!keyOf(opts); }

async function chat(messages, opts) {
  const o = opts || {};
  const key = keyOf(o);
  if (!key) {
    throw new Error('尚未配置 API Key：请到「API 设置」填入你自己的 DeepSeek Key（格式校对功能不需要 Key）');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeout || TIMEOUT_MS);
  try {
    const res = await fetch(baseOf(o) + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify({
        model: o.model || MODEL,
        messages,
        temperature: o.temperature == null ? 0.2 : o.temperature,
        max_tokens: o.maxTokens || 3000,
        response_format: o.json ? { type: 'json_object' } : undefined
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error('API Key 无效或已失效，请到「API 设置」重新填写');
      }
      if (res.status === 402 || /insufficient|balance/i.test(body)) {
        throw new Error('账户余额不足，请充值后再试');
      }
      throw new Error('模型接口 ' + res.status + ': ' + body.slice(0, 160));
    }
    const data = await res.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message.content) || '';
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function chatJSON(messages, opts) {
  const text = await chat(messages, Object.assign({}, opts, { json: true }));
  return common.parseJsonLoose(text);
}

async function extractPdfText(buffer) {
  let pdfParse;
  try { pdfParse = require('pdf-parse'); }
  catch (e) { throw new Error('云函数缺少依赖 pdf-parse，请在该云函数目录执行 npm install'); }
  const data = await pdfParse(buffer);
  const text = refseg.cleanText(data.text || '');
  return {
    text,
    pages: data.numpages || 0,
    chars: text.length,
    scanned: refseg.looksScanned(text, data.numpages)
  };
}

async function summarize(text, opts) {
  const o = opts || {};
  const body = String(text || '').slice(0, 120000);
  if (body.replace(/\s/g, '').length < 200) throw new Error('可读文本过少，可能是扫描版 PDF（暂无 OCR）');

  const keyOpts = { apiKey: o.apiKey, baseUrl: o.baseUrl };
  let source = body;
  if (body.length > 12000) {
    const chunks = common.chunkText(body, 5000, 150);
    const total = Math.min(chunks.length, 6);
    const notes = [];
    for (let i = 0; i < total; i++) {
      const part = await chat([
        { role: 'system', content: common.MAP_SYSTEM },
        { role: 'user', content: common.mapPrompt(i + 1, total, chunks[i]) }
      ], Object.assign({ maxTokens: 260, temperature: 0.1 }, keyOpts));
      notes.push(part);
    }
    source = notes.map((n, i) => '【片段' + (i + 1) + '】' + n).join('\n');
  }

  const out = await chatJSON([
    { role: 'system', content: common.SUMMARY_SYSTEM },
    { role: 'user', content: common.summaryPrompt(source) }
  ], Object.assign({ maxTokens: 2200, temperature: 0.2 }, keyOpts));

  return common.normalizeSummary(out);
}

async function extractTerms(text, opts) {
  const o = opts || {};
  const out = await chatJSON([
    { role: 'system', content: common.TERM_SYSTEM },
    { role: 'user', content: common.termPrompt(text) }
  ], { maxTokens: 900, temperature: 0, apiKey: o.apiKey, baseUrl: o.baseUrl });
  return Array.isArray(out.terms) ? out.terms.filter(t => t.en && t.zh).slice(0, 20) : [];
}

async function translate(text, opts) {
  const o = opts || {};
  const src = String(text || '').trim();
  if (src.length < 5) throw new Error('待翻译内容过短');
  const terms = o.terms && o.terms.length ? o.terms : await extractTerms(src, o);
  const termLine = terms.map(t => t.en + '=' + t.zh).join('; ');

  const chunks = common.chunkText(src, 2200, 0);
  const segments = [];
  for (const c of chunks) {
    const dst = await chat([
      { role: 'system', content: common.TRANSLATE_SYSTEM },
      { role: 'user', content: common.translatePrompt(termLine, c) }
    ], { maxTokens: 3000, temperature: 0.1, apiKey: o.apiKey, baseUrl: o.baseUrl });
    segments.push({ src: c, dst });
  }
  return { terms, segments, full: segments.map(s => s.dst).join('\n') };
}

/** 划词翻译：选中片段直译，不抽术语、不分段，尽量快 */
async function translateSelection(text, opts) {
  const o = opts || {};
  const src = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!src) throw new Error('选中内容为空');
  const out = await chat([
    { role: 'system', content: common.SELECTION_SYSTEM },
    { role: 'user', content: common.selectionPrompt(src) }
  ], { maxTokens: 800, temperature: 0.1, apiKey: o.apiKey, baseUrl: o.baseUrl });
  return out;
}

async function verifyKey(apiKey, baseUrl) {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, error: '未填写 Key' };
  if (!/^sk-[A-Za-z0-9_\-]{16,}$/.test(key)) return { ok: false, error: 'Key 格式不对（应以 sk- 开头）' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch((baseUrl || BASE).replace(/\/$/, '') + '/models', {
      signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + key }
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Key 无效或已失效' };
    if (!res.ok) return { ok: false, error: '服务返回 ' + res.status };
    const data = await res.json().catch(() => ({}));
    const models = (data.data || []).map(m => m.id).filter(Boolean);
    return { ok: true, models, hint: models.some(m => /deepseek/i.test(m)) ? '' : '该账户似乎没有 deepseek 模型' };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '连接超时' : (e.message || '连接失败') };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  hasKey, keyOf, baseOf, verifyKey, chat, chatJSON, extractPdfText,
  cleanText: refseg.cleanText,
  extractReferenceSection: refseg.extractReferenceSection,
  looksScanned: refseg.looksScanned,
  summarize, translate, extractTerms, translateSelection
};
