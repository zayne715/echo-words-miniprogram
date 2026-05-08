// TODO(refactor): word-detail-absorb 与 word-detail 共享约 95% 的逻辑。
// 见 word-detail/index.js 顶部注释了解合并建议。

const {
  getWordData,
  getLearningSessionKeysSnapshot,
  resolveLearningWordKey,
  getNextWordInLearningSession,
} = require("../../utils/wordRegistry.js");
const { learningRound1Progress } = require("../../utils/learningRound1Progress.js");
const { prefetchTtsTexts } = require("../../utils/baiduTtsPlay.js");
const {
  attachCloudWordImage,
  prefetchWordImageAhead,
  prefetchWordImageForKey,
  retryWordImageOnError,
  getCachedWordImagePathSync,
} = require("../../utils/wordImageCloud.js");
const {
  getCapsuleNavTop,
  schedulePageEnter,
  ensurePageEntered,
  clearPageEnterTimer,
  playWordWithToast,
  runPressTransition,
  relaunchHome,
  saveLearningCheckpointSafely,
} = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    activeTab: "examples",
    isNextAnimating: false,
    isNextPressed: false,
    navTop: 56,
    wordKey: "absorb",
    wordData: {},
    progressLabel: "1 / 1",
    progressFillWidth: 0,
    wordImageBroken: false,
  },

  onLoad(query) {
    const wordKey = resolveLearningWordKey(query.word);
    const bar = learningRound1Progress();
    const wd = getWordData(wordKey);
    const imgCached = getCachedWordImagePathSync(wordKey);
    this.setData({
      navTop: getCapsuleNavTop(8),
      wordKey,
      wordData: imgCached ? { ...wd, imageUrl: imgCached } : wd,
      progressLabel: bar.progressLabel,
      progressFillWidth: bar.progressFillWidth,
      wordImageBroken: false,
    });
    attachCloudWordImage(this, wordKey, this.data.wordData);
    prefetchWordImageForKey(wordKey, (wd && wd.word) || wordKey);
    prefetchWordImageAhead(wordKey, getLearningSessionKeysSnapshot(), 4);
    if (wd && wd.word) prefetchTtsTexts([wd.word]).catch(() => {});
    schedulePageEnter(this, 0, 120);
  },

  onReady() {
    ensurePageEntered(this);
  },

  onUnload() {
    clearPageEnterTimer(this);
    saveLearningCheckpointSafely(this);
  },

  onBack() {
    relaunchHome();
  },

  onWordImageError() {
    retryWordImageOnError(this);
  },

  onTapSpeakWord() {
    playWordWithToast(this.data.wordData && this.data.wordData.word);
  },

  onSwitchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({
      activeTab: tab,
    });
  },

  onTapNextWord() {
    runPressTransition(this, {
      animatingKey: "isNextAnimating",
      pressedKey: "isNextPressed",
      delayMs: 45,
      action: (reset) => {
        const nextWord = getNextWordInLearningSession(this.data.wordKey);
        if (!nextWord) {
          wx.redirectTo({
            url: `/pages/finish/index?word=${encodeURIComponent(this.data.wordKey)}`,
            fail: () => {
              wx.showToast({ title: "无法打开下一轮", icon: "none" });
            },
            complete: reset,
          });
          return;
        }
        wx.redirectTo({
          url: `/pages/learning-next/index?word=${encodeURIComponent(nextWord)}`,
          fail: () => {
            wx.showToast({ title: "无法打开下一词", icon: "none" });
          },
          complete: reset,
        });
      },
    });
  },
});
