/**
 * 将学习/复习完成与「当日打开过小程序」上报到云函数 reportAnalytics → analytics_user_day。
 * 失败静默，不影响主流程。
 */

const { warn } = require("./devLogger.js");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dayKeyFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const STORAGE_LAST_APP_PING_DAY = "ANALYTICS_APP_PING_DAY_V1";

function callReport(data) {
  if (!wx.cloud) return Promise.resolve();
  return wx.cloud
    .callFunction({
      name: "reportAnalytics",
      data: data,
    })
    .then(() => {})
    .catch(() => {});
}

/** 学完一组（与 round-complete 中本地统计一致） */
function reportStudyGroupToCloud(dateKey, wordsLearned, studyMs) {
  const dk = String(dateKey || "").trim();
  if (!dk) return Promise.resolve();
  const wl = Math.max(0, Math.floor(Number(wordsLearned) || 0));
  const ms = Math.max(0, Math.floor(Number(studyMs) || 0));
  if (!wl && !ms) return Promise.resolve();
  return callReport({
    dateKey: dk,
    wordsLearned: wl,
    studyMsDelta: ms,
    wordsReviewed: 0,
    reviewMsDelta: 0,
  });
}

/** 复习完一组 */
function reportReviewGroupToCloud(dateKey, wordsReviewed, reviewMs) {
  const dk = String(dateKey || "").trim();
  if (!dk) return Promise.resolve();
  const wr = Math.max(0, Math.floor(Number(wordsReviewed) || 0));
  const ms = Math.max(0, Math.floor(Number(reviewMs) || 0));
  if (!wr && !ms) return Promise.resolve();
  return callReport({
    dateKey: dk,
    wordsLearned: 0,
    studyMsDelta: 0,
    wordsReviewed: wr,
    reviewMsDelta: ms,
  });
}

/**
 * 每个自然日最多上报一次「打开」，用于 DAU 近似（与当日学习/复习写在同一文档的 appOpenCount）。
 */
function maybeReportAppOpenOncePerCalendarDay() {
  if (!wx.cloud) return;
  const today = dayKeyFromDate(new Date());
  try {
    if (wx.getStorageSync(STORAGE_LAST_APP_PING_DAY) === today) return;
  } catch (e) {
    return;
  }
  callReport({
    dateKey: today,
    wordsLearned: 0,
    studyMsDelta: 0,
    wordsReviewed: 0,
    reviewMsDelta: 0,
    appOpen: 1,
  }).then(() => {
    try {
      wx.setStorageSync(STORAGE_LAST_APP_PING_DAY, today);
    } catch (e) {
      warn("analyticsReport", "save app ping day failed", e);
    }
  });
}

module.exports = {
  reportStudyGroupToCloud,
  reportReviewGroupToCloud,
  maybeReportAppOpenOncePerCalendarDay,
};
