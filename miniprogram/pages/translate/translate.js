const api = require('../../utils/api.js');

Page({
  data: {
    src: '',
    terms: [],
    segments: [],
    loading: false,
    errorMsg: '',
    done: false
  },

  onLoad() {
    const app = getApp();
    const t = app.globalData.translateSeed;
    if (t) { this.setData({ src: t }); app.globalData.translateSeed = ''; }
  },

  onInput(e) { this.setData({ src: e.detail.value }); },

  pasteFromClipboard() {
    wx.getClipboardData({
      success: r => { this.setData({ src: (r.data || '').trim() }); }
    });
  },

  async run() {
    if (!api.ensureKey()) return;
    const src = (this.data.src || '').trim();
    if (src.length < 5) { wx.showToast({ title: '请先粘贴英文段落', icon: 'none' }); return; }
    this.setData({ loading: true, errorMsg: '', done: false });
    try {
      const d = await api.call('translate', { text: src });
      this.setData({ terms: d.terms || [], segments: d.segments || [], done: true, loading: false });
    } catch (e) {
      this.setData({ loading: false, errorMsg: String((e && (e.errMsg || e.message)) || '翻译失败').slice(0, 160) });
    }
  },

  copyAll() {
    const text = this.data.segments.map(s => s.dst).join('\n');
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '译文已复制' }) });
  }
});
