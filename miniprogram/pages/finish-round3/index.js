const { ensureRound3State } = require("../../utils/roundState.js");
const { getWordData } = require("../../utils/wordRegistry.js");
const { prefetchWordImageForKey } = require("../../utils/wordImageCloud.js");
const { saveLearningCheckpointSafely } = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
  },

  onLoad() {
    const app = getApp();
    const r3 = ensureRound3State(app);
    const first = r3.words[0];
    if (!first) {
      wx.reLaunch({
        url: "/pages/index/index",
      });
      return;
    }
    prefetchWordImageForKey(first, (getWordData(first) || {}).word);
    this.redirectTimer = setTimeout(() => {
      wx.redirectTo({
        url: `/pages/finish-final/index?word=${encodeURIComponent(first)}&round=3`,
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
