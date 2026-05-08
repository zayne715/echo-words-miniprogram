/** 「我的」Study settings：每组新学 / 复习词数（与 pages/me 存储键一致） */

const { warn } = require("./devLogger.js");

const STORAGE_STUDY = "studyWordsPerGroup";
const STORAGE_REVIEW = "reviewWordsPerGroup";

const DEFAULT_STUDY = 10;
const DEFAULT_REVIEW = 10;
const WORD_MIN = 1;
const WORD_MAX = 20;

function clampWord(n, fallback) {
  const x = Number(n);
  const fb = typeof fallback === "number" ? fallback : DEFAULT_STUDY;
  if (Number.isNaN(x)) return fb;
  return Math.min(WORD_MAX, Math.max(WORD_MIN, Math.round(x)));
}

function getStudyWordsPerGroup() {
  try {
    const s = wx.getStorageSync(STORAGE_STUDY);
    if (s !== "" && s !== undefined && s !== null && !Number.isNaN(Number(s))) {
      return clampWord(s, DEFAULT_STUDY);
    }
  } catch (e) {
    warn("studySettings", "getStudyWordsPerGroup failed", e);
  }
  return DEFAULT_STUDY;
}

function getReviewWordsPerGroup() {
  try {
    const r = wx.getStorageSync(STORAGE_REVIEW);
    if (r !== "" && r !== undefined && r !== null && !Number.isNaN(Number(r))) {
      return clampWord(r, DEFAULT_REVIEW);
    }
  } catch (e) {
    warn("studySettings", "getReviewWordsPerGroup failed", e);
  }
  return DEFAULT_REVIEW;
}

module.exports = {
  STORAGE_STUDY,
  STORAGE_REVIEW,
  DEFAULT_STUDY,
  DEFAULT_REVIEW,
  WORD_MIN,
  WORD_MAX,
  clampWord,
  getStudyWordsPerGroup,
  getReviewWordsPerGroup,
};
