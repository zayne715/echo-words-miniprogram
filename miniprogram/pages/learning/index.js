// TODO(refactor): learning 与 learning-next 共享大量逻辑（progress bar、云图片、TTS 预取、
// press-transition、checkpoint 保存）。差异点：learning 初始化 session timer、无 canGoPrev、
// 导航到 word-detail；learning-next 有 canGoPrev、回退逻辑、导航到 word-detail-absorb。
// 低风险重构方向：提取 wordPage1Mixin，或合并为带 isFirst 参数的单页。

const {
  getWordData,
  getLearningSessionFirstKey,
  getLearningSessionKeysSnapshot,
} = require("../../utils/wordRegistry.js");
const { learningRound1Progress } = require("../../utils/learningRound1Progress.js");
const {
  prefetchWordPage1Pack,
  scheduleAutoPlayWord,
} = require("../../utils/baiduTtsPlay.js");
const {
  attachCloudWordImage,
  prefetchWordImageAhead,
  prefetchWordImageForKey,
  retryWordImageOnError,
  getCachedWordImagePathSync,
} = require("../../utils/wordImageCloud.js");
const {
  getCapsuleNavTop,
  ensurePageEntered,
  playWordWithToast,
  playFirstExampleWithToast,
  runPressTransition,
  relaunchHome,
  saveLearningCheckpointSafely,
} = require("../../utils/pageUiHelpers.js");
Page({
  data: {
    entered: false,
    isContinueAnimating: false,
    isContinuePressed: false,
    navTop: 56,
    wordKey: "",
    wordData: {},
    progressLabel: "1 / 1",
    progressFillWidth: 0,
    wordImageBroken: false,
  },

  onLoad() {
    this.updateNavTop();
    try {
      const app = getApp();
      if (app && app.globalData) app.globalData.studySessionT0 = Date.now();
    } catch (e) {}
    const wordKey = getLearningSessionFirstKey();
    const bar = learningRound1Progress();
    const wd = getWordData(wordKey);
    const imgCached = getCachedWordImagePathSync(wordKey);
    this.setData({
      wordKey,
      wordData: imgCached ? { ...wd, imageUrl: imgCached } : wd,
      progressLabel: bar.progressLabel,
      progressFillWidth: bar.progressFillWidth,
      wordImageBroken: false,
    });
    attachCloudWordImage(this, wordKey, this.data.wordData);
    prefetchWordImageForKey(wordKey, (wd && wd.word) || wordKey);
    prefetchWordImageAhead(wordKey, getLearningSessionKeysSnapshot(), 4);
    prefetchWordPage1Pack(wd)
      .then(() => {
        scheduleAutoPlayWord((wd && wd.word) || "");
      })
      .catch(() => {});
    const sessionKeys = getLearningSessionKeysSnapshot();
    const nw = sessionKeys.length > 1 ? sessionKeys[1] : "";
    if (nw) {
      prefetchWordPage1Pack(getWordData(nw)).catch(() => {});
      prefetchWordImageForKey(nw, (getWordData(nw) || {}).word);
    }
  },

  onTapSpeakWord() {
    playWordWithToast(this.data.wordData && this.data.wordData.word);
  },

  /** 第一轮·页面1：粉色卡片下首条例句 */
  onTapSpeakPage1Example() {
    playFirstExampleWithToast(this.data.wordData);
  },

  onWordImageError() {
    retryWordImageOnError(this);
  },

  updateNavTop() {
    this.setData({
      // 让顶部栏位于系统胶囊按钮下方，并保留轻微间隙
      navTop: getCapsuleNavTop(8),
    });
  },

  onBackToHome() {
    relaunchHome();
  },

  onReady() {
    ensurePageEntered(this, 10);
  },

  onUnload() {
    saveLearningCheckpointSafely(this);
  },

  onTapContinue() {
    runPressTransition(this, {
      animatingKey: "isContinueAnimating",
      pressedKey: "isContinuePressed",
      delayMs: 45,
      action: (reset) => {
        const w = this.data.wordKey || "";
        wx.redirectTo({
          url: `/pages/word-detail/index?word=${encodeURIComponent(w)}`,
          fail: () => {
            wx.showToast({ title: "无法打开详情页", icon: "none" });
          },
          complete: reset,
        });
      },
    });
  },
});
