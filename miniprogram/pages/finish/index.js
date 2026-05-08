const { ensureRound2State } = require("../../utils/roundState.js");
const { saveLearningCheckpointSafely } = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
  },

  onLoad() {
    const app = getApp();
    const r2 = ensureRound2State(app);
    const words = r2.words || [];
    const first = words[0];
    if (!first) {
      wx.reLaunch({
        url: "/pages/index/index",
      });
      return;
    }
    r2.currentIndex = 0;
    this.redirectTimer = setTimeout(() => {
      wx.redirectTo({
        url: `/pages/finish-final/index?word=${encodeURIComponent(first)}`,
      });
    }, 780);
  },

  onReady() {
    setTimeout(() => {
      this.setData({
        entered: true,
      });
    }, 10);
  },

  onUnload() {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
      this.redirectTimer = null;
    }
    saveLearningCheckpointSafely(this);
  },
});
