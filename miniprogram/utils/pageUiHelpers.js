const { playWordTts, playFirstExampleSentenceTts } = require("./baiduTtsPlay.js");
const { warn } = require("./devLogger.js");

const DEFAULT_ENTER_FALLBACK_DELAY_MS = 120;
const DEFAULT_ENTER_READY_DELAY_MS = 80;
const DEFAULT_PRESS_TRANSITION_DELAY_MS = 45;

function getCapsuleNavTop(gap = 8) {
  try {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    return Math.round(menuBottom + Number(gap || 0));
  } catch (e) {
    return 88;
  }
}

function schedulePageEnter(page, delayMs = 0, fallbackDelayMs = DEFAULT_ENTER_FALLBACK_DELAY_MS) {
  if (!page || typeof page.setData !== "function") return;
  setTimeout(() => {
    page.setData({ entered: true });
  }, Number(delayMs) || 0);
  page._enterTimer = setTimeout(() => {
    if (!page.data || !page.data.entered) page.setData({ entered: true });
  }, Number(fallbackDelayMs) || DEFAULT_ENTER_FALLBACK_DELAY_MS);
}

function ensurePageEntered(page, delayMs = DEFAULT_ENTER_READY_DELAY_MS) {
  if (!page || typeof page.setData !== "function") return;
  setTimeout(() => {
    if (!page.data || !page.data.entered) page.setData({ entered: true });
  }, Number(delayMs) || DEFAULT_ENTER_READY_DELAY_MS);
}

function clearPageEnterTimer(page) {
  if (!page || !page._enterTimer) return;
  clearTimeout(page._enterTimer);
  page._enterTimer = null;
}

function showPlayFailedToast() {
  wx.showToast({ title: "播放失败", icon: "none" });
}

function playWordWithToast(word) {
  const w = String(word || "").trim();
  if (!w) return Promise.resolve();
  return playWordTts(w).catch(() => {
    showPlayFailedToast();
  });
}

function playFirstExampleWithToast(wordData) {
  return playFirstExampleSentenceTts(wordData).catch(() => {
    showPlayFailedToast();
  });
}

function runPressTransition(page, options) {
  const opts = options || {};
  const animatingKey = opts.animatingKey || "isAnimating";
  const pressedKey = opts.pressedKey || "isPressed";
  const delayMs = Number(opts.delayMs) || DEFAULT_PRESS_TRANSITION_DELAY_MS;
  const action = typeof opts.action === "function" ? opts.action : null;
  if (!page || !action) return;
  if (page.data && page.data[animatingKey]) return;
  page.setData({ [animatingKey]: true, [pressedKey]: true });
  const reset = () => {
    page.setData({ [animatingKey]: false, [pressedKey]: false });
  };
  setTimeout(() => {
    action(reset);
  }, delayMs);
}

function relaunchHome() {
  wx.reLaunch({ url: "/pages/index/index" });
}

function saveLearningCheckpointSafely(page) {
  try {
    const { saveLearningCheckpointFromPage } = require("./studyFlowCheckpoint.js");
    saveLearningCheckpointFromPage(page);
  } catch (e) {
    warn("pageUiHelpers", "saveLearningCheckpointSafely failed", e);
  }
}

function saveReviewCheckpointSafely(page) {
  try {
    const { saveReviewCheckpointFromPage } = require("./studyFlowCheckpoint.js");
    saveReviewCheckpointFromPage(page);
  } catch (e) {
    warn("pageUiHelpers", "saveReviewCheckpointSafely failed", e);
  }
}

function clearReviewCheckpointSafely() {
  try {
    const { clearReviewCheckpoint } = require("./studyFlowCheckpoint.js");
    clearReviewCheckpoint();
  } catch (e) {
    warn("pageUiHelpers", "clearReviewCheckpointSafely failed", e);
  }
}

function clearLearningCheckpointSafely() {
  try {
    const { clearLearningCheckpoint } = require("./studyFlowCheckpoint.js");
    clearLearningCheckpoint();
  } catch (e) {
    warn("pageUiHelpers", "clearLearningCheckpointSafely failed", e);
  }
}

module.exports = {
  getCapsuleNavTop,
  schedulePageEnter,
  ensurePageEntered,
  clearPageEnterTimer,
  playWordWithToast,
  playFirstExampleWithToast,
  runPressTransition,
  relaunchHome,
  saveLearningCheckpointSafely,
  saveReviewCheckpointSafely,
  clearReviewCheckpointSafely,
  clearLearningCheckpointSafely,
};
