const { getWordData, getDefaultWordKey, normalizeWordKey } = require("../../utils/wordRegistry.js");
const { progressBarSnapshot } = require("../../utils/roundProgressUi.js");
const { getRoundState } = require("../../utils/roundState.js");
const {
  prefetchWordPage1Pack,
  scheduleAutoPlayWord,
} = require("../../utils/baiduTtsPlay.js");
const {
  attachCloudWordImage,
  prefetchWordImageForKey,
  retryWordImageOnError,
  getCachedWordImagePathSync,
} = require("../../utils/wordImageCloud.js");
const {
  getCapsuleNavTop,
  ensurePageEntered,
  runPressTransition,
  relaunchHome,
  playWordWithToast,
  playFirstExampleWithToast,
  saveLearningCheckpointSafely,
} = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    navTop: 56,
    wordKey: "abandon",
    wordData: {},
    progressText: "0 / 4",
    progressFillWidth: 0,
    progressTier: 0,
    isSubmitting: false,
    isKnowPressed: false,
    isDontKnowPressed: false,
    canGoPrev: false,
    roundNum: 2,
    isRound3: false,
    wordImageBroken: false,
  },

  onLoad(query) {
    const app = getApp();
    const roundNum = query.round === "3" ? 3 : 2;
    const roundState = getRoundState(app, roundNum);
    if (roundNum === 3 && (!roundState.words || roundState.words.length === 0)) {
      wx.reLaunch({
        url: "/pages/index/index",
      });
      return;
    }
    const qw = normalizeWordKey(query.word);
    const incomingWord =
      qw && roundState.words.includes(qw) ? qw : roundState.words[0] || "abandon";
    roundState.currentIndex = roundState.words.indexOf(incomingWord);
    const wordKey = roundState.words[roundState.currentIndex] || getDefaultWordKey();
    const bar = progressBarSnapshot(roundState);
    const wd = getWordData(wordKey);
    const imgCached = roundNum !== 2 ? getCachedWordImagePathSync(wordKey) : "";
    this.setData({
      navTop: getCapsuleNavTop(8),
      wordKey,
      wordData: imgCached ? { ...wd, imageUrl: imgCached } : wd,
      canGoPrev: roundState.currentIndex > 0,
      roundNum,
      isRound3: roundNum === 3,
      wordImageBroken: false,
      ...bar,
    });
    /* 第二轮页面1：仅单词+音标+喇叭；不配云图；预取后自动播单词（与第三轮一致） */
    if (roundNum === 2) {
      prefetchWordPage1Pack(wd)
        .then(() => {
          scheduleAutoPlayWord((wd && wd.word) || "");
        })
        .catch(() => {});
      const idx = roundState.currentIndex;
      const words = roundState.words || [];
      if (idx + 1 < words.length) {
        const nextKey = words[idx + 1];
        const nwd = getWordData(nextKey);
        if (nwd && nwd.word) prefetchWordPage1Pack(nwd).catch(() => {});
      }
    } else {
      attachCloudWordImage(this, wordKey, this.data.wordData);
      prefetchWordPage1Pack(wd)
        .then(() => {
          scheduleAutoPlayWord((wd && wd.word) || "");
        })
        .catch(() => {});
      const idx = roundState.currentIndex;
      const words = roundState.words || [];
      if (idx + 1 < words.length) {
        const nextKey = words[idx + 1];
        prefetchWordPage1Pack(getWordData(nextKey)).catch(() => {});
        prefetchWordImageForKey(nextKey, (getWordData(nextKey) || {}).word);
      }
    }
  },

  onWordImageError() {
    retryWordImageOnError(this);
  },

  onTapSpeakWord() {
    playWordWithToast(this.data.wordData && this.data.wordData.word);
  },

  /** 第三轮·页面1：粉色卡片下首条例句 */
  onTapSpeakPage1Example() {
    playFirstExampleWithToast(this.data.wordData);
  },

  onReady() {
    ensurePageEntered(this, 10);
  },

  onUnload() {
    saveLearningCheckpointSafely(this);
  },

  onBackHome() {
    relaunchHome();
  },

  onBackToPrevWordSecondScreen() {
    if (!this.data.canGoPrev) return;
    const app = getApp();
    const roundState = getRoundState(app, this.data.roundNum);
    if (roundState.currentIndex <= 0) return;
    const prevWord = roundState.words[roundState.currentIndex - 1];
    const r = this.data.roundNum === 3 ? "&round=3" : "";
    wx.redirectTo({
      url: `/pages/recall-result/index?word=${prevWord}&fromBack=1${r}`,
    });
  },

  onTapResultAction(e) {
    const { action } = e.currentTarget.dataset;
    const app = getApp();
    const roundState = getRoundState(app, this.data.roundNum);
    roundState.pendingChoice = action || "know";
    const q = this.data.roundNum === 3 ? "&round=3" : "";
    runPressTransition(this, {
      animatingKey: "isSubmitting",
      pressedKey: action === "know" ? "isKnowPressed" : "isDontKnowPressed",
      delayMs: 45,
      action: (reset) => {
        wx.redirectTo({
          url: `/pages/recall-result/index?word=${this.data.wordKey}&action=${action || "know"}${q}`,
          fail: () => {
            wx.showToast({
              title: "跳转失败，请重试",
              icon: "none",
            });
          },
          complete: reset,
        });
      },
    });
  },
});
