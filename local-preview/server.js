/**
 * local-preview/server.js —— 本地 Web 复刻版
 * 作用：不打开微信开发者工具也能看到完整交互，用于自测、录屏、给评审演示。
 * 运行：node local-preview/server.js  （默认 http://127.0.0.1:5178）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ---- 加载 .env（不依赖 dotenv）----
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const gb = require('../shared/gb7714.js');
const core = require('../shared/docai-core.js');
const searchLinks = require('../shared/search-links.js');

const PORT = Number(process.env.PREVIEW_PORT || 5178);
const MOCK = process.env.MOCK === '1' || !core.hasKey();

/* ---------------- 静态资源：pdf.js（供原文预览） ---------------- */
const PDFJS_DIRS = [
  path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build'),
  path.join(__dirname, '..', 'app-android', 'node_modules', 'pdfjs-dist', 'legacy', 'build')
];
function resolvePdfjs(file) {
  for (const dir of PDFJS_DIRS) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/* ---------------- 相似论文检索（OpenAlex 优先，Crossref 兜底） ---------------- */
const SEARCH_CACHE = new Map();
const SEARCH_TTL = 10 * 60 * 1000;

async function searchPapers(q) {
  const key = q.toLowerCase();
  const hit = SEARCH_CACHE.get(key);
  if (hit && Date.now() - hit.t < SEARCH_TTL) return hit.list;

  let lastErr = null;
  try {
    const url = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) +
      '&per-page=8&select=id,title,publication_year,authorships,primary_location,best_oa_location,abstract_inverted_index,cited_by_count,doi';
    const r = await fetch(url, { headers: { 'User-Agent': 'DocAssist-local-preview' } });
    if (r.ok) {
      const d = await r.json();
      const list = searchLinks.normalizeList(d.results, 'openalex');
      SEARCH_CACHE.set(key, { t: Date.now(), list });
      return list;
    }
    lastErr = new Error('OpenAlex ' + r.status);
  } catch (e) { lastErr = e; }

  try {
    const url = 'https://api.crossref.org/works?query.bibliographic=' + encodeURIComponent(q) +
      '&rows=8&select=DOI,title,author,issued,container-title,abstract,URL,is-referenced-by-count';
    const r = await fetch(url, { headers: { 'User-Agent': 'DocAssist-local-preview' } });
    if (r.ok) {
      const d = await r.json();
      const list = searchLinks.normalizeList(d.message && d.message.items, 'crossref');
      SEARCH_CACHE.set(key, { t: Date.now(), list });
      return list;
    }
    throw new Error('Crossref ' + r.status);
  } catch (e) {
    throw new Error('检索服务暂时不可用：' + String((lastErr && lastErr.message) || e.message || e).slice(0, 80));
  }
}

/* ---------------- 示例数据（无 Key 时使用，界面会明确标注） ---------------- */
const MOCK_SUMMARY = {
  title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
  one_line: '把检索到的维基段落接进生成模型，让大模型在知识密集任务上少编、可溯源。',
  problem: '预训练语言模型把知识压进参数里，难以更新、无法溯源，在知识密集型任务上容易生成过时或错误内容。',
  method: '用稠密检索器（DPR）从维基百科取回相关段落，拼接成上下文输入 seq2seq 生成器（BART），端到端微调检索器与生成器。',
  data: 'Natural Questions、TriviaQA、WebQuestions 三个开放域问答数据集，对比封闭式生成模型与"检索+生成"变体。',
  results: [
    '在 NQ 上取得 44.5 EM，超过参数化-only 基线约 10 个点，并生成可追溯的出处。',
    '生成的回答中约 42% 完全正确且被支持，显著降低事实性幻觉比例。',
    '仅更换检索索引即可更新知识，无需重新训练生成器。'
  ],
  contributions: [
    '提出 RAG-Sequence 与 RAG-Token 两种检索-生成融合方式，并给出端到端训练目标。',
    '证明"外部检索"可以替代部分参数化记忆，兼顾可解释与可更新。'
  ],
  limitations: [
    '检索质量直接决定上限，检索器召回不足时生成会跟着错。',
    '训练与推理成本高于纯参数模型，长文档场景扩展性受限。'
  ],
  usable: [
    '做校园问答/文献助手时，先检索再生成比直接喂长文本更稳，也更省钱。',
    '把"出处段落"一并返回给用户，是提升可信度最省力的做法。'
  ],
  keywords: ['检索增强生成', 'RAG', '稠密检索', '开放域问答', '事实性'],
  terms: [
    { en: 'retrieval-augmented generation', zh: '检索增强生成', note: '先检索外部知识再生成答案的范式' },
    { en: 'dense passage retriever', zh: '稠密段落检索器', note: '用向量相似度召回段落的检索模型' },
    { en: 'parametric memory', zh: '参数化记忆', note: '把知识存在模型参数中的方式' },
    { en: 'hallucination', zh: '幻觉', note: '模型生成无依据内容' }
  ]
};

const MOCK_REFS = [
  'Lewis P, Perez E, Piktus A, et al. Retrieval-augmented generation for knowledge-intensive NLP tasks[C]. Advances in Neural Information Processing Systems, 2020: 9459-9474.',
  'Karpukhin V, Oğuz B, Min S, et al. Dense passage retrieval for open-domain question answering[C]. Proceedings of EMNLP, 2020: 6769-6781.'
];

/* ---------------- HTTP ---------------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 30 * 1024 * 1024) { reject(new Error('请求体过大（>30MB）')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);

  if (u.pathname === '/' || u.pathname === '/index.html') {
    const p = path.join(__dirname, 'public', 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(p));
  }

  if (u.pathname === '/api/health') {
    return send(res, 200, { ok: true, mock: MOCK, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' });
  }

  if (u.pathname === '/vendor/pdf.min.js' || u.pathname === '/vendor/pdf.worker.min.js') {
    const file = resolvePdfjs(path.basename(u.pathname));
    if (!file) { res.writeHead(404); return res.end('pdfjs-dist 未安装：请在项目根目录执行 npm install'); }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(file));
  }

  if (u.pathname === '/shared/preview-core.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, '..', 'shared', 'preview-core.js')));
  }

  if (u.pathname === '/shared/search-links.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, '..', 'shared', 'search-links.js')));
  }

  if (u.pathname === '/shared/library.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, '..', 'shared', 'library.js')));
  }

  if (u.pathname === '/api/searchPapers') {
    const q = String(u.query.q || '').trim();
    if (!q) return send(res, 400, { ok: false, error: '缺少检索词' });
    try {
      const list = await searchPapers(q);
      return send(res, 200, { ok: true, data: list });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }

  if (u.pathname === '/api/cite' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const r = gb.checkText(String(body.text || ''), { sort: !!body.sort, dedupe: true });
      return send(res, 200, { ok: true, data: r, referenceList: gb.toReferenceList(r.items, true) });
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }

  if (u.pathname === '/api/read' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const apiKey = String(body.apiKey || '').trim();
      const llmOpts = { apiKey: apiKey || undefined, baseUrl: body.baseUrl || undefined };
      if (MOCK && !apiKey) {
        const refs = core.extractReferenceSection('参考文献\n' + MOCK_REFS.map((s, i) => `[${i + 1}] ${s}`).join('\n'));
        return send(res, 200, {
          ok: true, mock: true,
          data: { summary: MOCK_SUMMARY, pages: 12, chars: 41000, references: refs.entries, costMs: 0 }
        });
      }
      let text = String(body.text || '');
      let pages = 0;
      if (body.pdfBase64) {
        const buf = Buffer.from(body.pdfBase64, 'base64');
        const pdf = await core.extractPdfText(buf);
        if (pdf.scanned) return send(res, 200, { ok: false, code: 'SCANNED_PDF', error: '扫描版 PDF，暂不支持（无 OCR）' });
        text = pdf.text; pages = pdf.pages;
      }
      const t0 = Date.now();
      const summary = await core.summarize(text, llmOpts);
      const refs = core.extractReferenceSection(text);
      return send(res, 200, {
        ok: true, data: { summary, pages, chars: text.length, references: refs.entries, costMs: Date.now() - t0 }
      });
    } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
  }

  if (u.pathname === '/api/verifyKey' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const out = await core.verifyKey(String(body.apiKey || ''), body.baseUrl);
      return send(res, 200, { ok: out.ok, data: out });
    } catch (e) { return send(res, 200, { ok: false, data: { ok: false, error: e.message } }); }
  }

  if (u.pathname === '/api/translate' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const text = String(body.text || '').trim();
      const apiKey = String(body.apiKey || '').trim();
      const llmOpts = { apiKey: apiKey || undefined, baseUrl: body.baseUrl || undefined };
      if (text.length < 5) return send(res, 400, { ok: false, error: '内容过短' });
      if (MOCK && !apiKey) {
        return send(res, 200, {
          ok: true, mock: true,
          data: {
            terms: MOCK_SUMMARY.terms.map(t => ({ en: t.en, zh: t.zh })),
            segments: [{ src: text, dst: '（示例译文）这里会输出与原文逐段对应的学术译文，术语严格采用上方术语表。' }],
            full: ''
          }
        });
      }
      const t0 = Date.now();
      const out = await core.translate(text, llmOpts);
      return send(res, 200, { ok: true, data: Object.assign({ costMs: Date.now() - t0 }, out) });
    } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
  }

  if (u.pathname === '/api/translateSelection' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const text = String(body.text || '').trim().slice(0, 1200);
      if (!text) return send(res, 400, { ok: false, error: '选中内容为空' });
      const apiKey = String(body.apiKey || '').trim();
      if (MOCK && !apiKey) {
        return send(res, 200, {
          ok: true, mock: true,
          data: { text: '（示例译文）这里会返回选中片段的学术译文；在「API 设置」填入自己的 Key 后为真实结果。' }
        });
      }
      const out = await core.translateSelection(text, {
        apiKey: apiKey || undefined, baseUrl: body.baseUrl || undefined
      });
      return send(res, 200, { ok: true, data: { text: out } });
    } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
  }

  if (u.pathname === '/api/assistant' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const question = String(body.question || '').trim();
      const apiKey = String(body.apiKey || '').trim();
      if (!question && !body.image) return send(res, 400, { ok: false, error: '请输入问题' });
      if (MOCK && !apiKey) {
        return send(res, 200, {
          ok: true, mock: true,
          data: { text: '（示例回答）配置 Key 后，这里会返回 AI 对选中内容或图片的解答。' }
        });
      }
      const text = await core.askAssistant({
        question: question,
        context: body.context,
        image: body.image,
        history: body.history,
        model: body.model,
        apiKey: apiKey || undefined,
        baseUrl: body.baseUrl || undefined
      });
      return send(res, 200, { ok: true, data: { text: text } });
    } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
  }

  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`文献助手 · 本地预览已启动  http://127.0.0.1:${PORT}`);
  console.log(MOCK ? '当前为 MOCK 模式（未检测到 DEEPSEEK_API_KEY，返回示例数据）'
                   : `已连接模型：${process.env.DEEPSEEK_MODEL || 'deepseek-chat'}`);
});
