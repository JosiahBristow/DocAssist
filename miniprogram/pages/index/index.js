const app = getApp();

Page({
  data: {
    stats: { papers: 0, fixed: 0 },
    hasKey: false,
    keyMasked: ''
  },
  onShow() {
    const api = require('../../utils/api.js');
    this.setData({
      stats: wx.getStorageSync('stats') || { papers: 0, fixed: 0 },
      hasKey: api.hasKey(),
      keyMasked: api.maskKey(api.getKey())
    });
  },
  goSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  goRead() { wx.navigateTo({ url: '/pages/read/read' }); },
  goCite() { wx.navigateTo({ url: '/pages/cite/cite' }); },
  goTranslate() { wx.navigateTo({ url: '/pages/translate/translate' }); }
});
