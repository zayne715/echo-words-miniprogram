const {
  beginLearningSession,
  getLearningSessionFirstKey,
  getWordData,
} = require("../../utils/wordRegistry.js");
const {
  prefetchWordImageToCache,
  prefetchLearningSessionWordImages,
  prefetchUpcomingLearningBatchImages,
} = require("../../utils/wordImageCloud.js");
const { getIndexPageSnapshot } = require("../../utils/appStatsHub.js");
const { getDueReviewCount } = require("../../utils/reviewSchedule.js");
const { getStudyWordsPerGroup } = require("../../utils/studySettings.js");
const { refreshWordBankFromCloud } = require("../../utils/wordBankCloud.js");
const { getMergedWordCount } = require("../../utils/wordRegistry.js");
const { getLearningResumePath, getReviewResumePath } = require("../../utils/studyFlowCheckpoint.js");

function reportStudyCardTap() {
  if (typeof wx.reportEvent !== "function") return;
  wx.reportEvent("tap_study_card", {});
}

function reportReviewCardTap() {
  if (typeof wx.reportEvent !== "function") return;
  wx.reportEvent("tap_review_card", {});
}

Page({
  data: {
    pageTop: 88,
    isNewStudyAnimating: false,
    isNewStudyPressed: false,
    isReviewPressed: false,
    studyPerGroupDisplay: "10",
    reviewDueDisplay: "0",
    weekWordsDisplay: "0",
    weekWordsUnit: "word",
    weekHoursDisplay: "0 min",
    weekDaysStudiedDisplay: "0",
    weekStudiedLabel: "days studied",
    showEncourage: false,
    encourageLine1: "",
    encourageLine2: "",
    encourageLine3: "",
  },

  onLoad() {
    this.setData({ pageTop: this.getPageTopBelowCapsule() });
    this.refreshHomeStats();
  },

  onShow() {
    this.refreshHomeStats();
    this.scheduleIdleWordImagePrefetch();
  },

  /** 用户浏览首页时后台预取下一组词图，点「新学」时粉色卡片更快出现 */
  scheduleIdleWordImagePrefetch() {
    if (this._idleImgPrefetchTimer) {
      clearTimeout(this._idleImgPrefetchTimer);
    }
    this._idleImgPrefetchTimer = setTimeout(() => {
      prefetchUpcomingLearningBatchImages().catch(() => {});
    }, 600);
  },

  refreshHomeStats() {
    const snap = getIndexPageSnapshot();
    const due = getDueReviewCount();
    const wn = snap.weekWords != null ? snap.weekWords : 0;
    const dn = snap.weekDaysStudied != null ? snap.weekDaysStudied : 0;
    this.setData({
      studyPerGroupDisplay: String(getStudyWordsPerGroup()),
      reviewDueDisplay: String(due),
      weekWordsDisplay: String(wn),
      weekWordsUnit: wn === 1 || wn === 0 ? "word" : "words",
      weekHoursDisplay: snap.weekHoursLabel || "0 min",
      weekDaysStudiedDisplay: String(dn),
      weekStudiedLabel: dn === 1 ? "day studied" : "days studied",
      showEncourage: !!snap.encourageVisible,
      encourageLine1: snap.encourageCard0 || "",
      encourageLine2: snap.encourageCard1 || "",
      encourageLine3: snap.encourageCard2 || "",
    });
  },

  getPageTopBelowCapsule() {
    try {
      const menuButton = wx.getMenuButtonBoundingClientRect();
      const bottom = menuButton.bottom || menuButton.top + menuButton.height;
      return Math.round(bottom + 6);
    } catch (e) {
      return 88;
    }
  },

  onTapNewStudy() {
    if (this.data.isNewStudyAnimating) return;
    reportStudyCardTap();

    const app = getApp();
    const resumePath = getLearningResumePath();
    if (resumePath) {
      this.setData({
        isNewStudyAnimating: true,
        isNewStudyPressed: true,
      });
      wx.redirectTo({
        url: resumePath,
        fail: () => {
          this.setData({
            isNewStudyAnimating: false,
            isNewStudyPressed: false,
          });
          wx.showToast({ title: "无法恢复进度", icon: "none" });
        },
        complete: () => {
          this.setData({
            isNewStudyAnimating: false,
            isNewStudyPressed: false,
          });
        },
      });
      return;
    }

    this.setData({
      isNewStudyAnimating: true,
      isNewStudyPressed: true,
    });

    const redirect = () => {
      wx.redirectTo({
        url: "/pages/learning/index",
        complete: () => {
          this.setData({
            isNewStudyAnimating: false,
            isNewStudyPressed: false,
          });
        },
      });
    };

    const startNewSession = () => {
      beginLearningSession(app);
      const firstKey = getLearningSessionFirstKey();
      const wd = getWordData(firstKey);
      try {
        const keys = (app.globalData && app.globalData.learningSessionKeys) || [];
        prefetchLearningSessionWordImages(keys);
      } catch (e) {}

      const warmKeys = (app.globalData.learningSessionKeys || []).slice(0, 3);
      const warmTasks = warmKeys.map((k) => {
        const w = getWordData(k);
        return prefetchWordImageToCache(k, (w && w.word) || k);
      });
      Promise.race([
        Promise.all(warmTasks),
        new Promise((r) => setTimeout(r, 4000)),
      ]).finally(() => {
        setTimeout(redirect, 45);
      });
    };

    const need = getStudyWordsPerGroup();
    if (wx.cloud && getMergedWordCount() < need) {
      refreshWordBankFromCloud().finally(startNewSession);
    } else {
      startNewSession();
    }
  },

  onTapReview() {
    reportReviewCardTap();
    this.setData({ isReviewPressed: true });
    setTimeout(() => {
      const resumePath = getReviewResumePath();
      if (!resumePath && getDueReviewCount() <= 0) {
        wx.showToast({
          title: "Complete a study group first to start review.",
          icon: "none",
        });
        this.setData({ isReviewPressed: false });
        return;
      }
      const url = resumePath || "/pages/review-word/index?reset=1";
      wx.navigateTo({
        url,
        complete: () => {
          this.setData({ isReviewPressed: false });
        },
      });
    }, 45);
  },

  onTapAiMemory() {
    wx.reLaunch({
      url: "/pages/ai-memory/index",
    });
  },

  onTabMe() {
    wx.reLaunch({
      url: "/pages/me/index",
    });
  },
});
