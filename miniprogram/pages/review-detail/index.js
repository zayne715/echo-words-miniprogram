const { getWordData, getDefaultWordKey } = require("../../utils/wordRegistry.js");
const {
  ensureReviewState,
  resolveReviewWordKey,
  getReviewWordIndex,
} = require("../../utils/reviewState.js");
const { reviewProgressSnapshot } = require("../../utils/reviewProgressUi.js");
const { prefetchTtsTexts } = require("../../utils/baiduTtsPlay.js");
const {
  attachCloudWordImage,
  retryWordImageOnError,
  getCachedWordImagePathSync,
} = require("../../utils/wordImageCloud.js");
const {
  getCapsuleNavTop,
  ensurePageEntered,
  runPressTransition,
  relaunchHome,
  playWordWithToast,
  saveReviewCheckpointSafely,
} = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    navTop: 56,
    showMistakeAndNext: true,
    wordKey: "abandon",
    wordData: {},
    progressText: "0 / 4",
    wordIndex: 0,
    activeTab: "examples",
    isActionSubmitting: false,
    isNextPressed: false,
    isMistakePressed: false,
    fromBackReturn: false,
    progressFillWidth: 0,
    page1Choice: "remember",
    wordImageBroken: false,
  },

  onLoad(query) {
    const app = getApp();
    const reviewState = ensureReviewState(app);
    const def = getDefaultWordKey();
    const wordKey = resolveReviewWordKey(reviewState, query.word, def);
    const wordIndex = getReviewWordIndex(reviewState, wordKey);
    reviewState.currentIndex = wordIndex < 0 ? 0 : wordIndex;
    const map = reviewState.reviewSingleNextByWord;
    if (query.action === "dont-remember") {
      map[wordKey] = true;
    } else if (query.action === "remember") {
      delete map[wordKey];
    }

    let showMistakeAndNext = true;
    let page1Choice = query.action || reviewState.choiceByWord[wordKey] || "remember";
    if (query.action === "dont-remember") {
      showMistakeAndNext = false;
    } else if (query.action === "remember") {
      showMistakeAndNext = true;
    } else if (query.fromBack === "1") {
      showMistakeAndNext = !map[wordKey];
      page1Choice = map[wordKey] ? "dont-remember" : "remember";
    }

    const bar = reviewProgressSnapshot(reviewState);
    const wd = getWordData(wordKey);
    const imgCached = getCachedWordImagePathSync(wordKey);
    this.setData({
      navTop: getCapsuleNavTop(8),
      showMistakeAndNext,
      wordKey,
      wordData: imgCached ? { ...wd, imageUrl: imgCached } : wd,
      wordIndex: wordIndex < 0 ? 0 : wordIndex,
      fromBackReturn: query.fromBack === "1",
      page1Choice,
      wordImageBroken: false,
      ...bar,
    });
    attachCloudWordImage(this, wordKey, this.data.wordData);
    if (wd && wd.word) prefetchTtsTexts([wd.word]).catch(() => {});
  },

  onWordImageError() {
    retryWordImageOnError(this);
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

  onBackToPrevWordSecondScreen() {
    // 需求：复习流程仅第二个单词的页面1可回退；页面2始终置灰不可点击
    return;
  },

  onSwitchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  onTapBottomAction(e) {
    const { action } = e.currentTarget.dataset;
    runPressTransition(this, {
      animatingKey: "isActionSubmitting",
      pressedKey: action === "next" ? "isNextPressed" : "isMistakePressed",
      delayMs: 45,
      action: () => {
        this.applyReviewProgressAndNext(action === "next" ? "next" : "mistake");
      },
    });
  },

  applyReviewProgressAndNext(actionType) {
    const app = getApp();
    const reviewState = ensureReviewState(app);
    const currentWord = this.data.wordKey;
    const fromBackReturn = this.data.fromBackReturn === true;
    const page1Choice = this.data.page1Choice || reviewState.choiceByWord[currentWord] || "remember";
    const barTotal =
      typeof reviewState.totalWordCount === "number"
        ? reviewState.totalWordCount
        : (reviewState.words && reviewState.words.length) || 0;

    let gainedPoint = false;
    if (actionType === "mistake") {
      if (fromBackReturn && reviewState.masteredByWord[currentWord]) {
        reviewState.progress = Math.max(0, reviewState.progress - 1);
        delete reviewState.masteredByWord[currentWord];
        if (!reviewState.unmastered.includes(currentWord)) reviewState.unmastered.push(currentWord);
      } else if (!fromBackReturn) {
        if (!reviewState.unmastered.includes(currentWord)) reviewState.unmastered.push(currentWord);
      }
    } else {
      if (!this.data.showMistakeAndNext) {
        reviewState.reviewSingleNextByWord[currentWord] = true;
      }
      if (page1Choice === "remember") {
        if (!fromBackReturn && !reviewState.masteredByWord[currentWord]) {
          reviewState.progress += 1;
          reviewState.masteredByWord[currentWord] = true;
          gainedPoint = true;
        }
      } else if (!reviewState.unmastered.includes(currentWord)) {
        reviewState.unmastered.push(currentWord);
      }
    }

    if (barTotal > 0 && reviewState.progress >= barTotal) {
      wx.redirectTo({
        url: "/pages/review-complete/index",
        complete: () => {
          this.setData({
            isActionSubmitting: false,
            isNextPressed: false,
            isMistakePressed: false,
          });
        },
      });
      return;
    }

    if (gainedPoint) {
      let nextIndex = this.data.wordIndex + 1;
      if (nextIndex >= reviewState.words.length) nextIndex = 0;
      reviewState.currentIndex = nextIndex;
    } else {
      const idx = reviewState.words.indexOf(currentWord);
      if (idx >= 0) {
        reviewState.words.splice(idx, 1);
        reviewState.words.push(currentWord);
        if (idx >= reviewState.words.length - 1) {
          reviewState.currentIndex = 0;
        } else {
          reviewState.currentIndex = idx;
        }
      } else {
        reviewState.currentIndex = 0;
      }
    }

    const loopNextWord = reviewState.words[reviewState.currentIndex];
    if (!loopNextWord) {
      wx.reLaunch({
        url: "/pages/index/index",
        complete: () => {
          this.setData({
            isActionSubmitting: false,
            isNextPressed: false,
            isMistakePressed: false,
          });
        },
      });
      return;
    }

    wx.redirectTo({
      url: `/pages/review-word/index?word=${loopNextWord}`,
      complete: () => {
        this.setData({
          isActionSubmitting: false,
          isNextPressed: false,
          isMistakePressed: false,
        });
      },
    });
  },
});
