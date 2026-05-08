const { getOrderedBatchKeys } = require("./wordRegistry.js");
const { getReviewWordsPerGroup } = require("./studySettings.js");
const { pickDueWordsForSession } = require("./reviewSchedule.js");

const DEFAULT_WORDS = ["abandon", "absorb", "adapt", "benefit"];
const REVIEW_STATE_OBJECT_FIELDS = [
  "progressPointClaimed",
  "choiceByWord",
  "actionByWord",
  "creditedWord",
  "masteredByWord",
  "reviewSingleNextByWord",
];

function defaultReviewWords() {
  const due = pickDueWordsForSession(getReviewWordsPerGroup());
  if (due && due.length) return due;
  const keys = getOrderedBatchKeys(getReviewWordsPerGroup());
  if (keys.length) return keys;
  return DEFAULT_WORDS.slice();
}

function createReviewState(words) {
  const list = Array.isArray(words) ? words.slice() : [];
  return {
    words: list,
    totalWordCount: list.length,
    progress: 0,
    currentIndex: 0,
    choiceByWord: {},
    progressPointClaimed: {},
    actionByWord: {},
    creditedWord: {},
    masteredByWord: {},
    unmastered: [],
    reviewSingleNextByWord: {},
  };
}

function ensureReviewStateShape(state) {
  if (!state || !Array.isArray(state.words)) return null;
  REVIEW_STATE_OBJECT_FIELDS.forEach((key) => {
    if (!state[key] || typeof state[key] !== "object") state[key] = {};
  });
  if (!Array.isArray(state.unmastered)) state.unmastered = [];
  if (typeof state.totalWordCount !== "number") {
    state.totalWordCount = (state.words && state.words.length) || DEFAULT_WORDS.length;
  }
  return state;
}

function ensureReviewState(app) {
  const state = app.globalData && app.globalData.reviewState;
  if (!ensureReviewStateShape(state)) {
    app.globalData.reviewState = createReviewState(defaultReviewWords());
    return app.globalData.reviewState;
  }
  return state;
}

function resetReviewSession(app) {
  app.globalData.reviewState = createReviewState(defaultReviewWords());
  app.globalData._reviewGroupStatsRecorded = false;
  return app.globalData.reviewState;
}

function normalizeReviewWord(word) {
  return String(word || "").trim().toLowerCase();
}

function getReviewWordIndex(state, wordKey) {
  const words = (state && Array.isArray(state.words) ? state.words : []).map(normalizeReviewWord);
  return words.indexOf(normalizeReviewWord(wordKey));
}

/** 复习页统一取词规则：优先 query.word（在当前队列中），否则 currentIndex */
function resolveReviewWordKey(state, queryWord, fallbackWord) {
  const words = (state && Array.isArray(state.words) ? state.words : []).map(normalizeReviewWord);
  const q = normalizeReviewWord(queryWord);
  if (q && words.includes(q)) return q;
  const idx = typeof state.currentIndex === "number" ? state.currentIndex : 0;
  if (words[idx]) return words[idx];
  if (words[0]) return words[0];
  return normalizeReviewWord(fallbackWord) || "abandon";
}

function getPrevReviewWordKey(state, wordKey) {
  const idx = getReviewWordIndex(state, wordKey);
  if (idx <= 0) return "";
  return normalizeReviewWord(state.words[idx - 1]);
}

module.exports = {
  ensureReviewState,
  resetReviewSession,
  resolveReviewWordKey,
  getReviewWordIndex,
  getPrevReviewWordKey,
};
