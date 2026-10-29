const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    stage: 'idle',
    fileName: '',
    tab: 'quick',
    summary: null,
    refs: [],
    pages: 0,
    chars: 0,
    costMs: 0,
    errorMsg: '',
    stepText: ''
  },

  chooseFile() {
    if (!api.ensureKey()) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: res => {
        const file = res.tempFiles[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          wx.showToast({ title: '文件请小于 20MB', icon: 'none' });
          return;
        }
        this.setData({ fileName: file.name || 'paper.pdf', stage: 'running', stepText: '正在上传文件…' });
        this.run(file.path, file.name || 'paper.pdf');
      }
    });
  },

  async run(tempPath, name) {
    try {
      const ext = (name.split('.').pop() || 'pdf').toLowerCase();
      const cloudPath = 'papers/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
      this.setData({ stepText: '正在解析 PDF 并生成速读…（约 10-30 秒）' });
      const d = await api.call('summarize', { fileID: up.fileID });
      app.globalData.lastRefs = d.references || [];
      this.setData({
        stage: 'done',
        summary: d.summary,
        refs: d.references || [],
        pages: d.pages,
        chars: d.chars,
        costMs: d.costMs
      });
      const stats = wx.getStorageSync('stats') || { papers: 0, fixed: 0 };
      stats.papers = (stats.papers || 0) + 1;
      wx.setStorageSync('stats', stats);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '处理失败，请重试';
      this.setData({ stage: 'error', errorMsg: String(msg).slice(0, 160) });
    }
  },

  retry() { this.setData({ stage: 'idle', summary: null, errorMsg: '' }); },

  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },

  onShow() { this.setData({ hasKey: api.hasKey() }); },

  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },

  copySummary() {
    const s = this.data.summary;
    if (!s) return;
    const text = [
      '【一句话】' + s.one_line,
      '【问题】' + s.problem,
      '【方法】' + s.method,
      '【数据】' + s.data,
      '【结论】' + s.results.map((x, i) => (i + 1) + '. ' + x).join(' '),
      '【创新】' + s.contributions.map((x, i) => (i + 1) + '. ' + x).join(' '),
      '【局限】' + s.limitations.map((x, i) => (i + 1) + '. ' + x).join(' ')
    ].join('\n');
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制' }) });
  },

  goCite() {
    if (!this.data.refs.length) {
      wx.showToast({ title: '这篇 PDF 没找到参考文献段', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/cite/cite?fromPdf=1' });
  },

  previewPdf() {
    wx.showToast({ title: '解析完成', icon: 'none' });
  }
});
