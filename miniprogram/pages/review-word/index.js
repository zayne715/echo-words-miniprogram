const { getWordData, getDefaultWordKey } = require("../../utils/wordRegistry.js");
const {
  ensureReviewState,
  resetReviewSession,
  resolveReviewWordKey,
  getReviewWordIndex,
  getPrevReviewWordKey,
} = require("../../utils/reviewState.js");
const { reviewProgressSnapshot } = require("../../utils/reviewProgressUi.js");
const { prefetchWordPage1Pack, scheduleAutoPlayWord } = require("../../utils/baiduTtsPlay.js");
const {
  getCapsuleNavTop,
  ensurePageEntered,
  runPressTransition,
  relaunchHome,
  playWordWithToast,
  saveReviewCheckpointSafely,
  clearReviewCheckpointSafely,
} = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    navTop: 56,
    wordKey: "abandon",
    wordData: {},
    progressText: "0 / 4",
    progressFillWidth: 0,
    isSubmitting: false,
    isRememberPressed: false,
    isDontPressed: false,
    canGoPrev: false,
  },

  onLoad(query) {
    const app = getApp();
    if (query.reset === "1") {
      clearReviewCheckpointSafely();
      resetReviewSession(app);
    }
    try {
      if (app && app.globalData) app.globalData.reviewSessionT0 = Date.now();
    } catch (e) {}
    const reviewState = ensureReviewState(app);
    const def = getDefaultWordKey();
    const wordKey = resolveReviewWordKey(reviewState, query.word, def);
    reviewState.currentIndex = getReviewWordIndex(reviewState, wordKey);
    const bar = reviewProgressSnapshot(reviewState);
    const idx = getReviewWordIndex(reviewState, wordKey);
    const wd = getWordData(wordKey);
    this.setData({
      navTop: getCapsuleNavTop(8),
      wordKey,
      wordData: wd,
      // 从第二个单词起（第2、3、4...）页面1都允许点右侧返回键
      canGoPrev: idx >= 1,
      ...bar,
    });
    if (wd && wd.word) {
      prefetchWordPage1Pack(wd)
        .then(() => {
          scheduleAutoPlayWord((wd && wd.word) || "");
        })
        .catch(() => {});
    }
  },

  onTapSpeakWord() {
    playWordWithToast(this.data.wordData && this.data.wordData.word);
  },

  onReady() {
    ensurePageEntered(this, 10);
  },

  onUnload() {
    saveReviewCheckpointSafely(this);
  },

  onBackHome() {
    relaunchHome();
  },

  /** 从第二个词的页面1 返回上一词「页面2 Next Word」界面 */
  onBackToPrevDetail() {
    if (!this.data.canGoPrev) return;
    const app = getApp();
    const reviewState = ensureReviewState(app);
    const prevWord = getPrevReviewWordKey(reviewState, this.data.wordKey);
    if (!prevWord) return;
    wx.redirectTo({
      url: `/pages/review-detail/index?word=${prevWord}&fromBack=1`,
    });
  },

  onTapChoice(e) {
    const { action } = e.currentTarget.dataset;
    const app = getApp();
    const reviewState = ensureReviewState(app);
    reviewState.choiceByWord[this.data.wordKey] = action === "remember" ? "remember" : "dont-remember";
    runPressTransition(this, {
      animatingKey: "isSubmitting",
      pressedKey: action === "remember" ? "isRememberPressed" : "isDontPressed",
      delayMs: 45,
      action: (reset) => {
        wx.redirectTo({
          url: `/pages/review-detail/index?word=${this.data.wordKey}&action=${action}`,
          complete: reset,
        });
      },
    });
  },
});
