/**
 * 云函数 docai —— 文献助手服务端
 * 密钥模型：BYOK（用户自带自己的 API Key）
 *   前端在每次请求里带上 apiKey，本函数只在内存中转发，不落库、不写日志、不回显。
 *   未带 apiKey 时回落到环境变量 DEEPSEEK_API_KEY（仅团队自测用，正式版本不配置）。
 *
 * action:
 *   summarize  { fileID? , text?, apiKey }     解析 PDF/文本 → 结构化速读
 *   translate  { text, terms?, apiKey }        学术翻译（术语一致）
 *   verifyKey  { apiKey, baseUrl? }            校验 Key 是否可用（不消耗 token）
 *   extract    { fileID }                      仅解析 PDF 文本（用于预览/抽参考文献）
 *   refs       { fileID? , text? }             抽取参考文献段落
 *   stats      {}                              全局统计（示例：无数据库时的降级）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const core = require('./docai-core');

async function readPdf(fileID) {
  const res = await cloud.downloadFile({ fileID });
  return core.extractPdfText(res.fileContent);
}

exports.main = async (event) => {
  const action = (event && event.action) || 'summarize';
  const started = Date.now();
  // 用户自带的密钥：仅在本函数内存中存在，不写入数据库/日志
  const apiKey = String((event && event.apiKey) || '').trim();
  const baseUrl = String((event && event.baseUrl) || '').trim() || undefined;
  const opts = { apiKey, baseUrl };
  // 出错时把密钥从消息里抹掉，避免随错误回显到前端
  const scrub = (msg) => {
    let s = String(msg || '');
    if (apiKey) s = s.split(apiKey).join('sk-***');
    return s.slice(0, 300);
  };
  try {
    if (action === 'summarize') {
      let pdf = null;
      if (event.fileID) pdf = await readPdf(event.fileID);
      const text = pdf ? pdf.text : String(event.text || '');
      if (pdf && pdf.scanned) {
        return { ok: false, code: 'SCANNED_PDF', error: '这是扫描版 PDF，暂时只支持有文字层的 PDF' };
      }
      const summary = await core.summarize(text, opts);
      const refs = core.extractReferenceSection(text);
      const result = {
        ok: true,
        data: {
          summary,
          pages: pdf ? pdf.pages : 0,
          chars: text.length,
          references: refs.found ? refs.entries : [],
          costMs: Date.now() - started
        }
      };
      // 可选：写入数据库做历史（集合不存在时静默降级）
      if (event.saveRefs !== false) {
        try {
          const db = cloud.database();
          await db.collection('papers').add({
            data: {
              openid: cloud.getWXContext().OPENID,
              title: summary.title,
              oneLine: summary.one_line,
              pages: result.data.pages,
              chars: result.data.chars,
              refCount: result.data.references.length,
              createdAt: db.serverDate()
            }
          });
        } catch (e) { /* 未建集合时忽略 */ }
      }
      return result;
    }

    if (action === 'translate') {
      const out = await core.translate(String(event.text || ''), {
        terms: event.terms, apiKey, baseUrl
      });
      return { ok: true, data: out };
    }

    if (action === 'verifyKey') {
      const out = await core.verifyKey(apiKey, baseUrl);
      return { ok: out.ok, data: out, error: out.ok ? '' : out.error };
    }

    if (action === 'extract') {
      const pdf = await readPdf(event.fileID);
      if (pdf.scanned) return { ok: false, code: 'SCANNED_PDF', error: '这是扫描版 PDF，暂时只支持有文字层的 PDF' };
      return { ok: true, data: { text: pdf.text.slice(0, 60000), pages: pdf.pages } };
    }

    if (action === 'refs') {
      let text = String(event.text || '');
      if (event.fileID) text = (await readPdf(event.fileID)).text;
      const refs = core.extractReferenceSection(text);
      return { ok: true, data: refs };
    }

    return { ok: false, error: '未知 action: ' + action };
  } catch (err) {
    return { ok: false, error: scrub((err && err.message) || err), costMs: Date.now() - started };
  }
};
