const api = require('../../utils/api.js');

Page({
  data: {
    input: '',
    savedMasked: '',
    hasKey: false,
    baseUrl: '',
    defaultBase: api.DEFAULT_BASE,
    showAdvanced: false,
    testing: false,
    testResult: '',
    testOk: false
  },

  onShow() {
    this.setData({
      hasKey: api.hasKey(),
      savedMasked: api.maskKey(api.getKey()),
      baseUrl: api.getBase()
    });
  },

  onInput(e) { this.setData({ input: e.detail.value, testResult: '' }); },
  onBase(e) { this.setData({ baseUrl: e.detail.value }); },
  toggleAdvanced() { this.setData({ showAdvanced: !this.data.showAdvanced }); },

  async test() {
    const key = (this.data.input || api.getKey()).trim();
    if (!key) { wx.showToast({ title: '请先填写 Key', icon: 'none' }); return; }
    this.setData({ testing: true, testResult: '' });
    try {
      const r = await api.verifyKey(key);
      if (r.ok) {
        const models = (r.models || []).filter(m => /deepseek/i.test(m)).slice(0, 3).join('、');
        this.setData({
          testing: false, testOk: true,
          testResult: '连接成功' + (models ? '，可用模型：' + models : '') + (r.hint ? '（' + r.hint + '）' : '')
        });
      } else {
        this.setData({ testing: false, testOk: false, testResult: r.error || '校验失败' });
      }
    } catch (e) {
      this.setData({ testing: false, testOk: false, testResult: (e && (e.errMsg || e.message)) || '校验失败' });
    }
  },

  save() {
    const key = (this.data.input || '').trim();
    if (!key) { wx.showToast({ title: '请先填写 Key', icon: 'none' }); return; }
    if (!/^sk-[A-Za-z0-9_\-]{16,}$/.test(key)) {
      wx.showToast({ title: 'Key 应以 sk- 开头', icon: 'none' });
      return;
    }
    api.setKey(key);
    api.setBase(this.data.baseUrl || api.DEFAULT_BASE);
    this.setData({ input: '', hasKey: true, savedMasked: api.maskKey(api.getKey()) });
    wx.showToast({ title: '已保存到本机', icon: 'success' });
  },

  clear() {
    wx.showModal({
      title: '清除本机 Key',
      content: '清除后速读与翻译将无法使用（格式校对不受影响）。',
      success: res => {
        if (!res.confirm) return;
        api.clearKey();
        this.setData({ hasKey: false, savedMasked: '', input: '', testResult: '' });
        wx.showToast({ title: '已清除', icon: 'none' });
      }
    });
  },

  copyGuide() {
    wx.setClipboardData({
      data: 'platform.deepseek.com → 登录 → API keys → 创建 API key（以 sk- 开头），复制后回到小程序的「API 设置」粘贴保存。',
      success: () => wx.showToast({ title: '获取步骤已复制' })
    });
  },

  goBack() { wx.navigateBack(); }
});
