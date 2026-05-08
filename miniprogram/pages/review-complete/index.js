const { ensureReviewState } = require("../../utils/reviewState.js");
const { recordReviewGroupCompleted } = require("../../utils/appStatsHub.js");
const { onReviewWordsCompletedToday } = require("../../utils/reviewSchedule.js");
const { appendReviewGroup } = require("../../utils/aiReviewGroupsStorage.js");
const { clearReviewCheckpointSafely } = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    summaryLine: "4 / 4 remembered",
    subLine: "Great memory! 🎉",
  },

  onLoad() {
    const app = getApp();
    const st = ensureReviewState(app);
    const total = typeof st.totalWordCount === "number" ? st.totalWordCount : 4;
    const p = typeof st.progress === "number" ? st.progress : total;
    this.setData({
      summaryLine: `${p} / ${total} remembered`,
    });

    const keys = (st.words || []).map((x) => String(x || "").toLowerCase()).filter(Boolean);
    const t0 = app.globalData && app.globalData.reviewSessionT0;
    const ms = t0 ? Math.max(0, Date.now() - t0) : 0;
    if (keys.length && !app.globalData._reviewGroupStatsRecorded) {
      recordReviewGroupCompleted(keys, ms);
      onReviewWordsCompletedToday(keys);
      appendReviewGroup(keys);
      app.globalData._reviewGroupStatsRecorded = true;
    }
    try {
      app.globalData.reviewSessionT0 = 0;
    } catch (e) {}
    setTimeout(() => {
      clearReviewCheckpointSafely();
    }, 0);
  },

  onReady() {
    setTimeout(() => {
      this.setData({ entered: true });
    }, 20);
  },

  onReturnHome() {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },
});
