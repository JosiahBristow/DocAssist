App({
  globalData: {
    env: '',
    lastRefs: []          // 从 PDF 抽取的参考文献，供格式校对页使用
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({ env: wx.cloud.DYNAMIC_CURRENT_ENV, traceUser: true });
    // 本地统计（用于首页展示使用量）
    if (!wx.getStorageSync('stats')) {
      wx.setStorageSync('stats', { papers: 0, fixed: 0 });
    }
  }
});
