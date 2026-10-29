/**
 * 云函数调用封装：BYOK（用户自带 API Key）
 * 密钥只保存在本机 storage，随每次请求传给云函数，在云函数内存中转发后即丢弃。
 */
const KEY_STORE = 'docai_api_key';
const BASE_STORE = 'docai_api_base';
const DEFAULT_BASE = 'https://api.deepseek.com/v1';

function getKey() { return String(wx.getStorageSync(KEY_STORE) || '').trim(); }
function setKey(k) { wx.setStorageSync(KEY_STORE, String(k || '').trim()); }
function clearKey() { wx.removeStorageSync(KEY_STORE); }
function hasKey() { return !!getKey(); }

function getBase() { return String(wx.getStorageSync(BASE_STORE) || '').trim() || DEFAULT_BASE; }
function setBase(b) { wx.setStorageSync(BASE_STORE, String(b || '').trim()); }

function maskKey(k) {
  const s = String(k || '');
  if (!s) return '';
  if (s.length <= 10) return s.slice(0, 2) + '••••';
  return s.slice(0, 6) + '••••••' + s.slice(-4);
}

/** 调用云函数；自动附带本机 Key */
async function call(action, data) {
  const apiKey = getKey();
  const payload = Object.assign({ action: action }, data || {});
  if (apiKey) payload.apiKey = apiKey;
  const base = wx.getStorageSync(BASE_STORE);
  if (base) payload.baseUrl = base;

  const r = await wx.cloud.callFunction({ name: 'docai', data: payload });
  const res = (r && r.result) || {};
  if (!res.ok) {
    const err = new Error(res.error || '调用失败');
    err.code = res.code || '';
    throw err;
  }
  return res.data;
}

/** 校验 Key（不消耗 token） */
async function verifyKey(key) {
  const payload = { action: 'verifyKey', apiKey: String(key || getKey()).trim() };
  const base = wx.getStorageSync(BASE_STORE);
  if (base) payload.baseUrl = base;
  const r = await wx.cloud.callFunction({ name: 'docai', data: payload });
  const res = (r && r.result) || {};
  return res.data || { ok: false, error: res.error || '校验失败' };
}

/** 需要 Key 的操作：未配置时引导去设置页 */
function ensureKey() {
  if (hasKey()) return true;
  wx.showModal({
    title: '需要配置你自己的 API Key',
    content: 'AI 速读与翻译使用你自己的 DeepSeek Key（费用走你的账户，本机保存）。\n参考文献格式校对不需要 Key，可以直接用。',
    confirmText: '去配置',
    cancelText: '先不用',
    success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/settings/settings' }); }
  });
  return false;
}

module.exports = { getKey, setKey, clearKey, hasKey, getBase, setBase, maskKey, call, verifyKey, ensureKey, DEFAULT_BASE };
