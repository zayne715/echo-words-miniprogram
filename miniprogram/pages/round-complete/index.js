const { ensureRound2State } = require("../../utils/roundState.js");
const { getLearningSessionKeysSnapshot } = require("../../utils/wordRegistry.js");
const { recordStudyGroupCompleted, dayKeyFromDate } = require("../../utils/appStatsHub.js");
const { onLearnGroupCompleted } = require("../../utils/reviewSchedule.js");
const { clearLearningCheckpointSafely } = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    summaryLine: "0 / 4 mastered",
  },

  onLoad() {
    const app = getApp();
    const r2 = ensureRound2State(app);
    const total =
      typeof r2.progressBarTotal === "number" ? r2.progressBarTotal : r2.words.length || 4;
    const p = typeof r2.progress === "number" ? r2.progress : total;
    this.setData({
      summaryLine: `${p} / ${total} mastered`,
    });

    const keys = getLearningSessionKeysSnapshot();
    const t0 = app.globalData && app.globalData.studySessionT0;
    const ms = t0 ? Math.max(0, Date.now() - t0) : 0;
    if (keys && keys.length && !app.globalData._studyGroupStatsRecorded) {
      recordStudyGroupCompleted(keys, ms);
      onLearnGroupCompleted(keys, dayKeyFromDate(new Date()));
      app.globalData._studyGroupStatsRecorded = true;
    }
    try {
      app.globalData.studySessionT0 = 0;
    } catch (e) {}
    setTimeout(() => {
      clearLearningCheckpointSafely();
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
