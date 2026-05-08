// TODO(refactor): word-detail 与 word-detail-absorb 共享约 95% 的逻辑（imports、data、
// onLoad、handlers），仅在 onTapNextWord 的 toast 文案和 wordKey 默认值上有差异。
// 低风险重构方向：将公共逻辑提取为 wordDetailPageMixin，或合并为带 variant 参数的单页。
// 重构前请确保新旧流程 E2E 测试覆盖，避免影响 learning → word-detail → learning-next 导航链。

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
    wordKey: "",
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
    prefetchWordImageForKey(wordKey, wd.word);
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
              wx.showToast({ title: "无法完成本轮", icon: "none" });
            },
            complete: reset,
          });
          return;
        }
        wx.redirectTo({
          url: `/pages/learning-next/index?word=${encodeURIComponent(nextWord)}`,
          fail: () => {
            wx.showToast({ title: "无法打开下一页", icon: "none" });
          },
          complete: reset,
        });
      },
    });
  },
});
