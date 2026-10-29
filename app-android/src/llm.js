/**
 * 浏览器端模型调用（Android 壳内）
 * 与云函数共用同一套提示词（shared/llm-common.js）：速读、翻译、Key 校验。
 * 传输层：优先 fetch；WebView 里若被 CORS 拦下，自动退回 CapacitorHttp（原生请求，不受 CORS 限制）。
 */
import * as common from '../../shared/llm-common.js';

const DEFAULT_BASE = 'https://api.deepseek.com/v1';
const MODEL = 'deepseek-chat';
const TIMEOUT_MS = 60000;

const store = {
  get key() { return (localStorage.getItem('docai_key') || '').trim(); },
  set key(v) { localStorage.setItem('docai_key', String(v || '').trim()); },
  get base() { return (localStorage.getItem('docai_base') || '').trim() || DEFAULT_BASE; },
  set base(v) { localStorage.setItem('docai_base', String(v || '').trim()); }
};

function capHttp() {
  const c = window.Capacitor;
  return (c && c.Plugins && c.Plugins.CapacitorHttp) ? c.Plugins.CapacitorHttp : null;
}

async function request(method, url, headers, data) {
  const opts = { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) };
  if (data !== undefined) opts.body = JSON.stringify(data);
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    const native = capHttp();
    if (!native) throw err;
    const r = await native.request({
      url, method, headers: opts.headers, data,
      connectTimeout: TIMEOUT_MS, readTimeout: TIMEOUT_MS
    });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text };
  }
}

function friendly(status, body) {
  if (status === 401 || status === 403) return new Error('API Key 无效或已失效，请到「API 设置」重新填写');
  if (status === 402 || /insufficient|balance/i.test(body || '')) return new Error('账户余额不足，请充值后再试');
  if (status === 429) return new Error('请求过于频繁，请稍后再试');
  return new Error('模型接口 ' + status + ': ' + String(body || '').slice(0, 160));
}

async function chat(messages, opts) {
  const o = opts || {};
  const key = o.apiKey || store.key;
  if (!key) throw new Error('尚未配置 API Key：请到「API 设置」填入你自己的 DeepSeek Key（格式校对不需要 Key）');
  const url = (o.baseUrl || store.base).replace(/\/$/, '') + '/chat/completions';
  const body = {
    model: o.model || MODEL,
    messages,
    temperature: o.temperature == null ? 0.2 : o.temperature,
    max_tokens: o.maxTokens || 3000,
    response_format: o.json ? { type: 'json_object' } : undefined
  };
  const res = await request('POST', url, { Authorization: 'Bearer ' + key }, body);
  if (!res.ok) throw friendly(res.status, res.text);
  const data = JSON.parse(res.text);
  return ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
}

async function chatJSON(messages, opts) {
  return common.parseJsonLoose(await chat(messages, Object.assign({}, opts, { json: true })));
}

export async function verifyKey(apiKey, baseUrl) {
  const key = String(apiKey || store.key || '').trim();
  if (!key) return { ok: false, error: '未填写 Key' };
  if (!/^sk-[A-Za-z0-9_\-]{16,}$/.test(key)) return { ok: false, error: 'Key 格式不对（应以 sk- 开头）' };
  try {
    const res = await request('GET', (baseUrl || store.base).replace(/\/$/, '') + '/models',
      { Authorization: 'Bearer ' + key });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Key 无效或已失效' };
    if (!res.ok) return { ok: false, error: '服务返回 ' + res.status };
    const data = JSON.parse(res.text || '{}');
    const models = (data.data || []).map(m => m.id).filter(Boolean);
    return { ok: true, models, hint: models.some(m => /deepseek/i.test(m)) ? '' : '该账户似乎没有 deepseek 模型' };
  } catch (e) {
    return { ok: false, error: e.message || '连接失败' };
  }
}

export async function summarize(text, opts) {
  const body = String(text || '').slice(0, 120000);
  if (body.replace(/\s/g, '').length < 200) throw new Error('可读文本过少，可能是扫描版 PDF（暂无 OCR）');
  let source = body;
  if (body.length > 12000) {
    const chunks = common.chunkText(body, 5000, 150);
    const total = Math.min(chunks.length, 6);
    const notes = [];
    for (let i = 0; i < total; i++) {
      notes.push(await chat([
        { role: 'system', content: common.MAP_SYSTEM },
        { role: 'user', content: common.mapPrompt(i + 1, total, chunks[i]) }
      ], Object.assign({ maxTokens: 260, temperature: 0.1 }, opts)));
    }
    source = notes.map((n, i) => '【片段' + (i + 1) + '】' + n).join('\n');
  }
  const out = await chatJSON([
    { role: 'system', content: common.SUMMARY_SYSTEM },
    { role: 'user', content: common.summaryPrompt(source) }
  ], Object.assign({ maxTokens: 2200, temperature: 0.2 }, opts));
  return common.normalizeSummary(out);
}

export async function translate(text, opts) {
  const o = opts || {};
  const src = String(text || '').trim();
  if (src.length < 5) throw new Error('待翻译内容过短');
  const terms = o.terms && o.terms.length ? o.terms : (await chatJSON([
    { role: 'system', content: common.TERM_SYSTEM },
    { role: 'user', content: common.termPrompt(src) }
  ], { maxTokens: 900, temperature: 0 })).terms || [];
  const termLine = terms.map(t => t.en + '=' + t.zh).join('; ');
  const chunks = common.chunkText(src, 2200, 0);
  const segments = [];
  for (const c of chunks) {
    const dst = await chat([
      { role: 'system', content: common.TRANSLATE_SYSTEM },
      { role: 'user', content: common.translatePrompt(termLine, c) }
    ], { maxTokens: 3000, temperature: 0.1 });
    segments.push({ src: c, dst });
  }
  return { terms: terms.filter(t => t.en && t.zh).slice(0, 20), segments };
}

export { store };
