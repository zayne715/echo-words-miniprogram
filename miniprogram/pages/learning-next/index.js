// TODO(refactor): learning-next 与 learning 共享大量逻辑。
// 见 learning/index.js 顶部注释了解合并建议。

const {
  getWordData,
  hasWord,
  resolveLearningWordKey,
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
  schedulePageEnter,
  ensurePageEntered,
  clearPageEnterTimer,
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
    wordKey: "absorb",
    wordData: {},
    progressLabel: "1 / 1",
    progressFillWidth: 0,
    wordImageBroken: false,
    canGoPrev: false,
  },

  onLoad(query) {
    const wordKey = resolveLearningWordKey(query.word);
    const sessionKeys = getLearningSessionKeysSnapshot();
    const curIdx = sessionKeys.indexOf(String(wordKey).toLowerCase());
    const canGoPrev = curIdx > 0;
    const bar = learningRound1Progress();
    const wd = getWordData(wordKey);
    const imgCached = getCachedWordImagePathSync(wordKey);
    this.setData({
      navTop: this.getNavTop(),
      wordKey,
      wordData: imgCached ? { ...wd, imageUrl: imgCached } : wd,
      progressLabel: bar.progressLabel,
      progressFillWidth: bar.progressFillWidth,
      wordImageBroken: false,
      canGoPrev,
    });
    attachCloudWordImage(this, wordKey, this.data.wordData);
    prefetchWordImageForKey(wordKey, (wd && wd.word) || wordKey);
    prefetchWordImageAhead(wordKey, sessionKeys, 4);
    prefetchWordPage1Pack(wd)
      .then(() => {
        scheduleAutoPlayWord((wd && wd.word) || "");
      })
      .catch(() => {});
    const nw = curIdx >= 0 ? sessionKeys[curIdx + 1] : "";
    if (nw && hasWord(nw)) {
      prefetchWordPage1Pack(getWordData(nw)).catch(() => {});
      prefetchWordImageForKey(nw, (getWordData(nw) || {}).word);
    }
    /* 下一宏任务点亮入场，避免个别机型上定时器未触发时整页停在 translateX(100%) 看起来像「空白」 */
    schedulePageEnter(this, 0, 120);
  },

  getNavTop() {
    return getCapsuleNavTop(8);
  },

  onReady() {
    ensurePageEntered(this);
  },

  onUnload() {
    clearPageEnterTimer(this);
    saveLearningCheckpointSafely(this);
  },

  onWordImageError() {
    retryWordImageOnError(this);
  },

  onTapSpeakWord() {
    playWordWithToast(this.data.wordData && this.data.wordData.word);
  },

  onTapSpeakPage1Example() {
    playFirstExampleWithToast(this.data.wordData);
  },

  onBackToHome() {
    relaunchHome();
  },

  onBackToPrevWordSecondScreen() {
    if (!this.data.canGoPrev) return;
    const sessionKeys = getLearningSessionKeysSnapshot();
    const curIdx = sessionKeys.indexOf(String(this.data.wordKey || "").toLowerCase());
    if (curIdx <= 0) return;
    const prevKey = sessionKeys[curIdx - 1];
    if (!prevKey) return;
    const enc = encodeURIComponent(prevKey);
    const url =
      curIdx - 1 === 0
        ? `/pages/word-detail/index?word=${enc}`
        : `/pages/word-detail-absorb/index?word=${enc}`;
    wx.redirectTo({
      url,
      fail: () => {
        wx.showToast({ title: "无法返回上一词", icon: "none" });
      },
    });
  },

  onTapContinue() {
    runPressTransition(this, {
      animatingKey: "isContinueAnimating",
      pressedKey: "isContinuePressed",
      delayMs: 45,
      action: (reset) => {
        const w = this.data.wordKey || "";
        wx.redirectTo({
          url: `/pages/word-detail-absorb/index?word=${encodeURIComponent(w)}`,
          fail: () => {
            wx.showToast({ title: "无法打开下一页", icon: "none" });
          },
          complete: reset,
        });
      },
    });
  },
});
