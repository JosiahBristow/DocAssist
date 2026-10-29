const gb = require('../../utils/gb7714.js');
const app = getApp();

const SAMPLE = `[1] 周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.
[2] 李四，王五. 深度学习综述 [J]. 计算机学报，2020，43（6）：1001～1020
[3] Vaswani A, Shazeer N, Parmar N, Uszkoreit J, Jones L. Attention is all you need[C]. Advances in Neural Information Processing Systems, 2017: 5998-6008.
[4] OpenAI. GPT-4 Technical Report[EB/OL]. https://arxiv.org/abs/2303.08774
[5] 张三. 面向校园场景的智能问答系统研究[D]. 长沙: 国防科技大学, 2023.`;

Page({
  data: {
    input: '',
    result: null,
    fromPdf: false,
    sortOn: true,
    numberedOn: true,
    open: {}
  },

  onLoad(q) {
    if (q && q.fromPdf && app.globalData.lastRefs && app.globalData.lastRefs.length) {
      const text = app.globalData.lastRefs
        .map((s, i) => '[' + (i + 1) + '] ' + s.replace(/^\s*\[\d+\]\s*/, ''))
        .join('\n');
      this.setData({ input: text, fromPdf: true });
      this.check();
    }
  },

  onInput(e) { this.setData({ input: e.detail.value }); },

  loadSample() { this.setData({ input: SAMPLE, fromPdf: false }); this.check(); },

  pasteFromClipboard() {
    wx.getClipboardData({
      success: r => {
        const add = (r.data || '').trim();
        if (!add) { wx.showToast({ title: '剪贴板为空', icon: 'none' }); return; }
        const next = this.data.input ? this.data.input + '\n' + add : add;
        this.setData({ input: next });
        this.check();
      }
    });
  },

  check() {
    const text = (this.data.input || '').trim();
    if (!text) { wx.showToast({ title: '请先粘贴参考文献', icon: 'none' }); return; }
    const r = gb.checkText(text, { sort: this.data.sortOn, dedupe: true });
    const open = {};
    r.items.forEach((it, i) => { if (it.stats.errs > 0) open[i] = true; });
    this.setData({ result: r, open });
  },

  toggle(e) {
    const i = e.currentTarget.dataset.i;
    const open = Object.assign({}, this.data.open);
    open[i] = !open[i];
    this.setData({ open });
  },

  switchSort() {
    this.setData({ sortOn: !this.data.sortOn });
    if (this.data.result) this.check();
  },

  /** 一键修正：把全部条目替换为修正后的文本，并重新校验 */
  fixAll() {
    const r = this.data.result;
    if (!r || !r.items.length) return;
    const fixedText = gb.toReferenceList(r.items, this.data.numberedOn);
    const fixedCount = r.items.reduce((n, it) => n + (it.changed ? it.problems.filter(p => p.hasFix).length : 0), 0);
    const stats = wx.getStorageSync('stats') || { papers: 0, fixed: 0 };
    stats.fixed = (stats.fixed || 0) + fixedCount;
    wx.setStorageSync('stats', stats);
    this.setData({ input: fixedText, fromPdf: false });
    this.check();
    wx.showToast({ title: '已修正 ' + fixedCount + ' 处', icon: 'none' });
  },

  copyList() {
    const r = this.data.result;
    if (!r) return;
    const text = gb.toReferenceList(r.items, this.data.numberedOn);
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '文献表已复制', icon: 'success' }) });
  },

  copyBib() {
    const r = this.data.result;
    if (!r) return;
    wx.setClipboardData({
      data: gb.toBibTeX(r.items.filter(it => !it.duplicateOf)),
      success: () => wx.showToast({ title: 'BibTeX 已复制', icon: 'success' })
    });
  },

  copyOne(e) {
    const i = e.currentTarget.dataset.i;
    const it = this.data.result.items[i];
    wx.setClipboardData({ data: it.fixed, success: () => wx.showToast({ title: '已复制' }) });
  },

  clearAll() { this.setData({ input: '', result: null, fromPdf: false }); }
});
