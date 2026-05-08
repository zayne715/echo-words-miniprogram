/**
 * 学习 / 复习流程断点：中途退出后，首页再次进入时恢复上次页面（与当前会话词表一致才有效）。
 * 冷启动：在 app.onLaunch 中根据本地 restore 包恢复 globalData，避免被 beginLearningSession 覆盖。
 */
const LEARN_CK = "STUDY_FLOW_CHECKPOINT_V1";
const REVIEW_CK = "REVIEW_FLOW_CHECKPOINT_V1";

const {
  getLearningSessionKeysSnapshot,
  normalizeSessionKeys,
  persistLearningSessionKeys,
  invalidateMergedCache,
  beginLearningSession,
  getOrderedBatchKeys,
  getNextLearningBatchKeys,
  LEARNING_SESSION_KEYS_STORAGE,
} = require("./wordRegistry.js");
const { getStudyWordsPerGroup, getReviewWordsPerGroup } = require("./studySettings.js");
const { pickDueWordsForSession } = require("./reviewSchedule.js");
const { warn } = require("./devLogger.js");
const {
  cloneJson,
  normalizeOneWord,
  reviewSigFromWords,
  pushUnique,
  clampProgress,
  extractWordFromPath,
  buildPathFromPage,
} = require("./studyFlowCheckpointHelpers.js");

const LEARNING_ROUTES = new Set([
  "pages/learning/index",
  "pages/learning-next/index",
  "pages/word-detail/index",
  "pages/word-detail-absorb/index",
  "pages/finish/index",
  "pages/finish-round3/index",
  "pages/finish-final/index",
  "pages/recall-result/index",
]);

const REVIEW_ROUTES = new Set([
  "pages/review-word/index",
  "pages/review-detail/index",
]);

function learningSigFromKeys(keys) {
  return normalizeSessionKeys(keys).join("|");
}

function learningSig() {
  try {
    const keys = getLearningSessionKeysSnapshot();
    return (keys || []).join("|");
  } catch (e) {
    warn("studyFlowCheckpoint", "learningSig failed", e);
    return "";
  }
}

function reviewSig() {
  try {
    const app = getApp();
    const w = app && app.globalData && app.globalData.reviewState && app.globalData.reviewState.words;
    return reviewSigFromWords(w);
  } catch (e) {
    warn("studyFlowCheckpoint", "reviewSig failed", e);
    return "";
  }
}

function resizeWordsForSetting(existingWords, candidateWords, targetCount, mustKeepWord) {
  const count = Math.max(1, Math.min(20, Number(targetCount) || 1));
  const keep = normalizeOneWord(mustKeepWord);
  const merged = [];
  normalizeSessionKeys(existingWords || []).forEach((w) => pushUnique(merged, w));
  normalizeSessionKeys(candidateWords || []).forEach((w) => pushUnique(merged, w));
  if (keep && !merged.includes(keep)) merged.unshift(keep);

  const sized = merged.slice(0, count);
  if (keep && !sized.includes(keep)) {
    if (sized.length < count) {
      sized.push(keep);
    } else if (sized.length) {
      sized[sized.length - 1] = keep;
    } else {
      sized.push(keep);
    }
  }
  return sized;
}

function alignRoundStateToWords(state, words, mustKeepWord) {
  if (!state || !Array.isArray(state.words)) return null;
  const keep = normalizeOneWord(mustKeepWord);
  const next = {
    ...state,
    words: words.slice(),
    progressBarTotal: words.length,
    progress: clampProgress(state.progress, words.length),
    pendingChoice: state.pendingChoice || "",
    unmastered: Array.isArray(state.unmastered) ? state.unmastered.slice() : [],
    recallSingleNextByWord: state.recallSingleNextByWord || {},
    masteredByWord: state.masteredByWord || {},
  };
  if (keep && words.includes(keep)) {
    next.currentIndex = words.indexOf(keep);
  } else if (typeof state.currentIndex !== "number") {
    next.currentIndex = 0;
  } else {
    next.currentIndex = Math.min(Math.max(0, state.currentIndex), Math.max(0, words.length - 1));
  }
  return next;
}

function learningTargetWords() {
  const n = getStudyWordsPerGroup();
  const words = getNextLearningBatchKeys(n);
  return words && words.length ? normalizeSessionKeys(words) : normalizeSessionKeys(["abandon", "absorb", "adapt", "benefit"]);
}

function reviewTargetWords() {
  const n = getReviewWordsPerGroup();
  const due = pickDueWordsForSession(n);
  if (due && due.length) return normalizeSessionKeys(due);
  const words = getOrderedBatchKeys(n);
  if (words && words.length) return normalizeSessionKeys(words);
  return normalizeSessionKeys(["abandon", "absorb", "adapt", "benefit"]);
}

function snapshotLearningRestore() {
  const app = getApp();
  if (!app || !app.globalData) return null;
  const gd = app.globalData;
  return {
    learningSessionKeys: Array.isArray(gd.learningSessionKeys) ? gd.learningSessionKeys.slice() : [],
    round2State: gd.round2State ? cloneJson(gd.round2State) : null,
    round3State: gd.round3State ? cloneJson(gd.round3State) : null,
    studyGroupStatsRecorded: !!gd._studyGroupStatsRecorded,
  };
}

function snapshotReviewRestore() {
  const app = getApp();
  if (!app || !app.globalData || !app.globalData.reviewState) return null;
  const rs = app.globalData.reviewState;
  if (!Array.isArray(rs.words) || !rs.words.length) return null;
  return {
    reviewState: cloneJson(rs),
    reviewGroupStatsRecorded: !!app.globalData._reviewGroupStatsRecorded,
  };
}

function applyLearningRestore(app, restore) {
  if (!app || !app.globalData || !restore) return false;
  const keys = normalizeSessionKeys(restore.learningSessionKeys);
  if (!keys.length) return false;
  app.globalData.learningSessionKeys = keys.slice();
  persistLearningSessionKeys(keys.slice());
  app.globalData._studyGroupStatsRecorded = !!restore.studyGroupStatsRecorded;
  if (restore.round2State && Array.isArray(restore.round2State.words) && restore.round2State.words.length) {
    app.globalData.round2State = cloneJson(restore.round2State);
  } else {
    app.globalData.round2State = {
      words: keys.slice(),
      progress: 0,
      progressBarTotal: keys.length,
      currentIndex: 0,
      pendingChoice: "",
      unmastered: [],
      recallSingleNextByWord: {},
      masteredByWord: {},
    };
  }
  if (restore.round3State && Array.isArray(restore.round3State.words) && restore.round3State.words.length) {
    app.globalData.round3State = cloneJson(restore.round3State);
  } else {
    app.globalData.round3State = null;
  }
  invalidateMergedCache();
  return true;
}

function resizeLearningRestoreForSettings(restore, path) {
  if (!restore) return null;
  const target = learningTargetWords();
  const targetCount = getStudyWordsPerGroup();
  const keep = extractWordFromPath(path);
  const oldKeys =
    restore.learningSessionKeys ||
    (restore.round2State && restore.round2State.words) ||
    getLearningSessionKeysSnapshot();
  const keys = resizeWordsForSetting(oldKeys, target, targetCount, keep);
  if (!keys.length) return null;

  const next = {
    ...restore,
    learningSessionKeys: keys.slice(),
    studyGroupStatsRecorded: !!restore.studyGroupStatsRecorded,
  };

  const round2Base = restore.round2State && Array.isArray(restore.round2State.words)
    ? resizeWordsForSetting(restore.round2State.words, keys, keys.length, keep)
    : keys.slice();
  next.round2State =
    alignRoundStateToWords(restore.round2State, round2Base, keep) || {
      words: keys.slice(),
      progress: 0,
      progressBarTotal: keys.length,
      currentIndex: keep && keys.includes(keep) ? keys.indexOf(keep) : 0,
      pendingChoice: "",
      unmastered: [],
      recallSingleNextByWord: {},
      masteredByWord: {},
    };

  if (restore.round3State && Array.isArray(restore.round3State.words)) {
    const r3 = restore.round3State;
    const mastered = next.round2State.masteredByWord || {};
    const candidates = r3.words.concat(keys.filter((w) => !mastered[w]));
    const remainingNeeded = Math.max(1, keys.length - clampProgress(r3.progress, keys.length));
    const r3Words = resizeWordsForSetting(candidates, keys, remainingNeeded, keep);
    next.round3State = alignRoundStateToWords(r3, r3Words, keep);
    if (next.round3State) {
      next.round3State.progressBarTotal = keys.length;
      next.round3State.progress = clampProgress(r3.progress, keys.length);
    }
  } else {
    next.round3State = null;
  }

  return next;
}

function resizeReviewRestoreForSettings(restore, path) {
  if (!restore || !restore.reviewState) return null;
  const rs = restore.reviewState;
  const target = reviewTargetWords();
  const targetCount = getReviewWordsPerGroup();
  const keep = extractWordFromPath(path);
  const words = resizeWordsForSetting(rs.words, target, targetCount, keep);
  if (!words.length) return null;
  const nextState = {
    ...rs,
    words,
    totalWordCount: words.length,
    progress: clampProgress(rs.progress, words.length),
    choiceByWord: rs.choiceByWord || {},
    progressPointClaimed: rs.progressPointClaimed || {},
    actionByWord: rs.actionByWord || {},
    creditedWord: rs.creditedWord || {},
  };
  if (keep && words.includes(keep)) {
    nextState.currentIndex = words.indexOf(keep);
  } else if (typeof rs.currentIndex !== "number") {
    nextState.currentIndex = 0;
  } else {
    nextState.currentIndex = Math.min(Math.max(0, rs.currentIndex), Math.max(0, words.length - 1));
  }
  return {
    ...restore,
    reviewState: nextState,
    reviewGroupStatsRecorded: !!restore.reviewGroupStatsRecorded,
  };
}

/**
 * 冷启动：若有有效学习断点则恢复 globalData，否则与原先一致调用 beginLearningSession。
 */
function tryRestoreLearningFlowOnLaunch(app) {
  if (!app || !app.globalData) {
    return;
  }
  let raw = null;
  try {
    raw = wx.getStorageSync(LEARN_CK);
  } catch (e) {
    raw = null;
  }

  if (raw && raw.path && raw.sig) {
    if (raw.restore && raw.restore.learningSessionKeys) {
      const restore = resizeLearningRestoreForSettings(raw.restore, raw.path) || raw.restore;
      const keysSig = learningSigFromKeys(restore.learningSessionKeys);
      if (keysSig && applyLearningRestore(app, restore)) {
        try {
          wx.setStorageSync(LEARN_CK, { ...raw, sig: keysSig, restore, ts: Date.now() });
        } catch (e) {
          warn("studyFlowCheckpoint", "写入学习断点失败（启动恢复阶段）", e);
        }
        return;
      }
    }
    try {
      const storageRaw = wx.getStorageSync(LEARNING_SESSION_KEYS_STORAGE);
      const parsed =
        storageRaw !== undefined && storageRaw !== null && storageRaw !== ""
          ? JSON.parse(storageRaw)
          : [];
      if (Array.isArray(parsed) && learningSigFromKeys(parsed) === raw.sig) {
        if (
          applyLearningRestore(app, {
            learningSessionKeys: parsed,
            round2State: null,
            round3State: null,
            studyGroupStatsRecorded: false,
          })
        ) {
          return;
        }
      }
    } catch (e2) {
      warn("studyFlowCheckpoint", "读取 LEARNING_SESSION_KEYS_STORAGE 失败", e2);
    }
  }

  /* 无断点时不预建会话：避免云库未同步时仅用本地 4 词，导致进度显示 0/4 与设置 10 不一致 */
  if (!Array.isArray(app.globalData.learningSessionKeys)) {
    app.globalData.learningSessionKeys = [];
  }
}

/** 冷启动：若有有效复习断点则恢复 reviewState（无断点则不写默认，交给首屏 ensureReviewState）。 */
function tryRestoreReviewFlowOnLaunch(app) {
  if (!app || !app.globalData) return;
  let raw = null;
  try {
    raw = wx.getStorageSync(REVIEW_CK);
  } catch (e) {
    raw = null;
  }
  if (!raw || !raw.sig || !raw.restore || !raw.restore.reviewState) return;
  const restore = resizeReviewRestoreForSettings(raw.restore, raw.path) || raw.restore;
  const words = restore.reviewState.words;
  if (!Array.isArray(words) || !words.length) return;
  const sig = reviewSigFromWords(words);
  if (!sig) return;
  const cloned = cloneJson(restore.reviewState);
  if (!cloned) return;
  app.globalData.reviewState = cloned;
  app.globalData._reviewGroupStatsRecorded = !!restore.reviewGroupStatsRecorded;
  try {
    wx.setStorageSync(REVIEW_CK, { ...raw, sig, restore, ts: Date.now() });
  } catch (e) {
    warn("studyFlowCheckpoint", "写入复习断点失败（启动恢复阶段）", e);
  }
}

function saveLearningCheckpointFromPage(page) {
  const route = (page && page.route) || "";
  if (!LEARNING_ROUTES.has(route)) return;
  const path = buildPathFromPage(page);
  if (!path) return;
  const sig = learningSig();
  if (!sig) return;
  const restore = snapshotLearningRestore() || {
    learningSessionKeys: [],
    round2State: null,
    round3State: null,
    studyGroupStatsRecorded: false,
  };
  if (!restore.learningSessionKeys || !restore.learningSessionKeys.length) {
    restore.learningSessionKeys = getLearningSessionKeysSnapshot().slice();
  }
  if (!normalizeSessionKeys(restore.learningSessionKeys).length) return;
  try {
    wx.setStorageSync(LEARN_CK, { path, sig, ts: Date.now(), restore });
  } catch (e) {
    warn("studyFlowCheckpoint", "保存学习断点失败", e);
  }
}

function saveReviewCheckpointFromPage(page) {
  const route = (page && page.route) || "";
  if (!REVIEW_ROUTES.has(route)) return;
  const path = buildPathFromPage(page);
  if (!path) return;
  const sig = reviewSig();
  if (!sig) return;
  const restore = snapshotReviewRestore();
  if (!restore || !restore.reviewState) return;
  try {
    wx.setStorageSync(REVIEW_CK, { path, sig, ts: Date.now(), restore });
  } catch (e) {
    warn("studyFlowCheckpoint", "保存复习断点失败", e);
  }
}

function syncLearningCheckpointWithStudySettings() {
  let raw = null;
  try {
    raw = wx.getStorageSync(LEARN_CK);
  } catch (e) {
    raw = null;
  }
  if (!raw || !raw.path || !raw.restore) return;
  const restore = resizeLearningRestoreForSettings(raw.restore, raw.path);
  if (!restore || !restore.learningSessionKeys || !restore.learningSessionKeys.length) return;
  const sig = learningSigFromKeys(restore.learningSessionKeys);
  try {
    wx.setStorageSync(LEARN_CK, {
      ...raw,
      sig,
      restore,
      ts: Date.now(),
    });
  } catch (e) {
    warn("studyFlowCheckpoint", "同步学习断点失败", e);
  }
  try {
    const app = getApp();
    if (app && app.globalData && Array.isArray(app.globalData.learningSessionKeys)) {
      applyLearningRestore(app, restore);
    }
  } catch (e2) {
    warn("studyFlowCheckpoint", "同步学习断点到 globalData 失败", e2);
  }
}

function syncReviewCheckpointWithStudySettings() {
  let raw = null;
  try {
    raw = wx.getStorageSync(REVIEW_CK);
  } catch (e) {
    raw = null;
  }
  if (!raw || !raw.path || !raw.restore) return;
  const restore = resizeReviewRestoreForSettings(raw.restore, raw.path);
  if (!restore || !restore.reviewState || !restore.reviewState.words.length) return;
  const sig = reviewSigFromWords(restore.reviewState.words);
  try {
    wx.setStorageSync(REVIEW_CK, {
      ...raw,
      sig,
      restore,
      ts: Date.now(),
    });
  } catch (e) {
    warn("studyFlowCheckpoint", "同步复习断点失败", e);
  }
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.reviewState = cloneJson(restore.reviewState);
      app.globalData._reviewGroupStatsRecorded = !!restore.reviewGroupStatsRecorded;
    }
  } catch (e2) {
    warn("studyFlowCheckpoint", "同步复习断点到 globalData 失败", e2);
  }
}

function syncActiveFlowSettingsWithStudySettings() {
  syncLearningCheckpointWithStudySettings();
  syncReviewCheckpointWithStudySettings();
}

function clearLearningCheckpoint() {
  try {
    wx.removeStorageSync(LEARN_CK);
  } catch (e) {
    warn("studyFlowCheckpoint", "清理学习断点存储失败", e);
  }
  try {
    const { releaseLearningSessionLock } = require("./wordRegistry.js");
    releaseLearningSessionLock();
  } catch (e) {
    warn("studyFlowCheckpoint", "释放学习会话锁失败", e);
  }
}

function clearReviewCheckpoint() {
  try {
    wx.removeStorageSync(REVIEW_CK);
  } catch (e) {
    warn("studyFlowCheckpoint", "清理复习断点存储失败", e);
  }
}

function getLearningResumePath() {
  try {
    syncLearningCheckpointWithStudySettings();
    const raw = wx.getStorageSync(LEARN_CK);
    if (!raw || !raw.path || !raw.sig) return "";
    if (raw.sig !== learningSig()) {
      wx.removeStorageSync(LEARN_CK);
      return "";
    }
    return String(raw.path);
  } catch (e) {
    warn("studyFlowCheckpoint", "getLearningResumePath failed", e);
    return "";
  }
}

function getReviewResumePath() {
  try {
    syncReviewCheckpointWithStudySettings();
    const raw = wx.getStorageSync(REVIEW_CK);
    if (!raw || !raw.path || !raw.sig) return "";
    if (raw.sig !== reviewSig()) {
      wx.removeStorageSync(REVIEW_CK);
      return "";
    }
    return String(raw.path);
  } catch (e) {
    warn("studyFlowCheckpoint", "getReviewResumePath failed", e);
    return "";
  }
}

module.exports = {
  saveLearningCheckpointFromPage,
  saveReviewCheckpointFromPage,
  clearLearningCheckpoint,
  clearReviewCheckpoint,
  getLearningResumePath,
  getReviewResumePath,
  tryRestoreLearningFlowOnLaunch,
  tryRestoreReviewFlowOnLaunch,
  syncActiveFlowSettingsWithStudySettings,
};
