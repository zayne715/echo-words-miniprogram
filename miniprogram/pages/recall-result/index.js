const { getWordData, hasWord, getDefaultWordKey } = require("../../utils/wordRegistry.js");
const { progressBarSnapshot } = require("../../utils/roundProgressUi.js");
const {
  getRoundState,
  buildRound3FromRound2,
  shouldSkipRound3,
  ensureRound2State,
} = require("../../utils/roundState.js");
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
  saveLearningCheckpointSafely,
} = require("../../utils/pageUiHelpers.js");

Page({
  data: {
    entered: false,
    navTop: 56,
    action: "know",
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
    progressTier: 0,
    roundNum: 2,
    isRound3: false,
    tabExamplesLabel: "Examples",
    tabInflectionsLabel: "Inflections",
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
    const def = getDefaultWordKey();
    const wordKey =
      query.word && hasWord(query.word) ? query.word : roundState.words[roundState.currentIndex] || def;
    const wordIndex = roundState.words.indexOf(wordKey);
    const map = roundState.recallSingleNextByWord;
    if (query.action === "dont-know") {
      map[wordKey] = true;
    } else if (query.action === "know") {
      delete map[wordKey];
    }

    let showMistakeAndNext = true;
    let actionState = query.action || "know";
    if (query.action === "dont-know") {
      showMistakeAndNext = false;
    } else if (query.action === "know") {
      showMistakeAndNext = true;
    } else if (query.fromBack === "1") {
      showMistakeAndNext = !map[wordKey];
      actionState = map[wordKey] ? "dont-know" : "know";
    }

    const bar = progressBarSnapshot(roundState);
    const wd = getWordData(wordKey);
    const imgCached = getCachedWordImagePathSync(wordKey);
    this.setData({
      navTop: getCapsuleNavTop(8),
      action: actionState,
      showMistakeAndNext,
      wordKey,
      wordData: imgCached ? { ...wd, imageUrl: imgCached } : wd,
      wordIndex: wordIndex < 0 ? 0 : wordIndex,
      fromBackReturn: query.fromBack === "1",
      roundNum,
      isRound3: roundNum === 3,
      tabExamplesLabel: roundNum === 3 ? "Example" : "Examples",
      tabInflectionsLabel: roundNum === 3 ? "Derivation" : "Inflections",
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
    saveLearningCheckpointSafely(this);
  },

  onBackHome() {
    relaunchHome();
  },

  onBackToPrevWordSecondScreen() {
    const prevIndex = this.data.wordIndex - 1;
    if (prevIndex < 0) return;
    const app = getApp();
    const roundState = getRoundState(app, this.data.roundNum);
    const prevWord = roundState.words[prevIndex];
    if (!prevWord) return;
    const r = this.data.roundNum === 3 ? "&round=3" : "";
    wx.redirectTo({
      url: `/pages/recall-result/index?word=${prevWord}&fromBack=1${r}`,
    });
  },

  onSwitchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({
      activeTab: tab,
    });
  },

  onTapBottomAction(e) {
    const { action } = e.currentTarget.dataset;
    runPressTransition(this, {
      animatingKey: "isActionSubmitting",
      pressedKey: action === "next" ? "isNextPressed" : "isMistakePressed",
      delayMs: 45,
      action: () => {
        this.applyRoundProgressAndNext(action === "next" ? "next" : "mistake");
      },
    });
  },

  applyRoundProgressAndNext(actionType) {
    const app = getApp();
    const roundNum = this.data.roundNum;
    const roundState = getRoundState(app, roundNum);
    const currentWord = this.data.wordKey;
    const fromBackReturn = this.data.fromBackReturn === true;
    const pendingChoice = roundState.pendingChoice || this.data.action || "know";

    let gainedPoint = false;
    if (actionType === "mistake") {
      if (fromBackReturn && roundState.masteredByWord[currentWord]) {
        roundState.progress = Math.max(0, roundState.progress - 1);
        delete roundState.masteredByWord[currentWord];
        if (!roundState.unmastered.includes(currentWord)) roundState.unmastered.push(currentWord);
      } else if (!fromBackReturn) {
        if (!roundState.unmastered.includes(currentWord)) roundState.unmastered.push(currentWord);
      }
    } else {
      if (!this.data.showMistakeAndNext) {
        roundState.recallSingleNextByWord[currentWord] = true;
      }
      if (pendingChoice === "know") {
        if (!fromBackReturn && !roundState.masteredByWord[currentWord]) {
          roundState.progress += 1;
          roundState.masteredByWord[currentWord] = true;
          gainedPoint = true;
        }
      } else if (!roundState.unmastered.includes(currentWord)) {
        roundState.unmastered.push(currentWord);
      }
    }

    roundState.pendingChoice = "";
    if (roundNum === 3) {
      const barTotal =
        typeof roundState.progressBarTotal === "number"
          ? roundState.progressBarTotal
          : roundState.words.length;
      if (roundState.progress >= barTotal) {
        const r2 = ensureRound2State(app);
        r2.progress = barTotal;
        wx.redirectTo({
          url: "/pages/round-complete/index",
        });
        return;
      }

      if (gainedPoint) {
        let nextIndex = this.data.wordIndex + 1;
        if (nextIndex >= roundState.words.length) nextIndex = 0;
        roundState.currentIndex = nextIndex;
      } else {
        // 第三轮未计 +1 的词放到队尾，形成循环队列直到 N/N
        const idx = roundState.words.indexOf(currentWord);
        if (idx >= 0) {
          roundState.words.splice(idx, 1);
          roundState.words.push(currentWord);
          if (idx >= roundState.words.length - 1) {
            roundState.currentIndex = 0;
          } else {
            roundState.currentIndex = idx;
          }
        } else {
          roundState.currentIndex = 0;
        }
      }

      const loopNextWord = roundState.words[roundState.currentIndex];
      if (!loopNextWord) {
        wx.reLaunch({
          url: "/pages/index/index",
        });
        return;
      }
      wx.redirectTo({
        url: `/pages/finish-final/index?word=${loopNextWord}&round=3`,
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

    const nextIndex = this.data.wordIndex + 1;
    roundState.currentIndex = nextIndex;
    const nextWord = roundState.words[nextIndex];

    if (!nextWord) {
      if (shouldSkipRound3(app)) {
        wx.redirectTo({
          url: "/pages/round-complete/index",
        });
        return;
      }
      buildRound3FromRound2(app);
      wx.redirectTo({
        url: "/pages/finish-round3/index",
      });
      return;
    }

    wx.redirectTo({
      url: `/pages/finish-final/index?word=${nextWord}${roundNum === 3 ? "&round=3" : ""}`,
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
