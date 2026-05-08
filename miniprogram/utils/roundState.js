const {
  getOrderedBatchKeys,
  getLearningSessionKeysSnapshot,
  normalizeSessionKeys,
} = require("./wordRegistry.js");
const { getStudyWordsPerGroup } = require("./studySettings.js");

const ROUND_STATE_OBJECT_FIELDS = ["recallSingleNextByWord", "masteredByWord"];

function createRoundState(words) {
  return {
    words: words || [],
    progress: 0,
    /** 进度条分母：第三轮沿用第二轮词表长度 */
    progressBarTotal: undefined,
    currentIndex: 0,
    pendingChoice: "",
    unmastered: [],
    recallSingleNextByWord: {},
    masteredByWord: {},
  };
}

function ensureRoundStateShape(state, fallbackProgressBarTotal) {
  if (!state || !Array.isArray(state.words)) return null;
  ROUND_STATE_OBJECT_FIELDS.forEach((key) => {
    if (!state[key] || typeof state[key] !== "object") state[key] = {};
  });
  if (!Array.isArray(state.unmastered)) state.unmastered = [];
  if (state.progressBarTotal == null && typeof fallbackProgressBarTotal === "number") {
    state.progressBarTotal = fallbackProgressBarTotal;
  }
  return state;
}

function defaultRound2Words() {
  const keys = getOrderedBatchKeys(getStudyWordsPerGroup());
  if (keys.length) return keys;
  return ["abandon", "absorb", "adapt", "benefit"];
}

function ensureRound2State(app) {
  const sessionWords = normalizeSessionKeys(getLearningSessionKeysSnapshot());
  if (sessionWords.length) {
    const r2 = app.globalData.round2State;
    const same =
      r2 &&
      Array.isArray(r2.words) &&
      normalizeSessionKeys(r2.words).join("|") === sessionWords.join("|");
    if (!same) {
      const prev = r2 || {};
      app.globalData.round2State = {
        words: sessionWords.slice(),
        progress: typeof prev.progress === "number" ? prev.progress : 0,
        progressBarTotal: sessionWords.length,
        currentIndex: typeof prev.currentIndex === "number" ? prev.currentIndex : 0,
        pendingChoice: prev.pendingChoice || "",
        unmastered: Array.isArray(prev.unmastered) ? prev.unmastered.slice() : [],
        recallSingleNextByWord: prev.recallSingleNextByWord || {},
        masteredByWord: prev.masteredByWord || {},
      };
    }
  } else if (!ensureRoundStateShape(app.globalData.round2State)) {
    app.globalData.round2State = createRoundState(defaultRound2Words());
    app.globalData.round2State.progressBarTotal = app.globalData.round2State.words.length;
  }
  if (ensureRoundStateShape(app.globalData.round2State)) {
    if (typeof app.globalData.round2State.progressBarTotal !== "number") {
      app.globalData.round2State.progressBarTotal = app.globalData.round2State.words.length;
    }
    if (
      sessionWords.length &&
      app.globalData.round2State.progressBarTotal !== sessionWords.length
    ) {
      app.globalData.round2State.progressBarTotal = sessionWords.length;
    }
  }
  return app.globalData.round2State;
}

function ensureRound3State(app) {
  const r2 = ensureRound2State(app);
  if (!ensureRoundStateShape(app.globalData.round3State, r2.words.length)) {
    app.globalData.round3State = createRoundState([]);
    app.globalData.round3State.progressBarTotal = r2.words.length;
  }
  return app.globalData.round3State;
}

/** 第二轮未掌握（未因 Know→Next 计 +1）的词，顺序与第二轮队列一致 */
function buildRound3FromRound2(app) {
  const r2 = ensureRound2State(app);
  const words = r2.words.filter((w) => !r2.masteredByWord[w]);
  const r3 = createRoundState(words);
  r3.progress = typeof r2.progress === "number" ? r2.progress : 0;
  r3.progressBarTotal = r2.words.length;
  app.globalData.round3State = r3;
  return app.globalData.round3State;
}

function shouldSkipRound3(app) {
  const r2 = ensureRound2State(app);
  const remaining = r2.words.filter((w) => !r2.masteredByWord[w]);
  if (remaining.length === 0) return true;
  if (r2.progress >= r2.words.length) return true;
  return false;
}

function getRoundState(app, roundNum) {
  return roundNum === 3 ? ensureRound3State(app) : ensureRound2State(app);
}

module.exports = {
  ensureRound2State,
  ensureRound3State,
  buildRound3FromRound2,
  shouldSkipRound3,
  getRoundState,
};
