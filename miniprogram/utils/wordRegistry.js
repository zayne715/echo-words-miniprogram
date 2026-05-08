/**
 * 合并本地 data/wordData.js 与云数据库词条，供学习 / 复习 / AI Memory 共用。
 */

const { getStudyWordsPerGroup } = require("./studySettings.js");
const { warn } = require("./devLogger.js");
const {
  ensureExampleShape,
  splitMeaningCombined,
  clone,
  normalizeSessionKeys,
  normalizeWordKey,
  emptyWordPlaceholder,
} = require("./wordRegistryHelpers.js");

const BUNDLE = require("../data/wordData.js").WORD_DATA;

const CACHE_KEY = "WORD_BANK_OVERLAY_V1";

let overlay = {};
/** 展示顺序：云库顺序优先，再接本地 bundle 中未出现在云库的词条 */
let orderedKeys = [];

let mergedCache = null;

function invalidateCache() {
  mergedCache = null;
}

/** 供断点恢复后重建 nextWord 等派生字段 */
function invalidateMergedCache() {
  invalidateCache();
}

function initWordRegistry() {
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (c && c.overlay && Array.isArray(c.orderedKeys)) {
      overlay = c.overlay || {};
      orderedKeys = c.orderedKeys || [];
    }
  } catch (e) {
    warn("wordRegistry", "读取词库缓存失败，回退到 bundle", e);
  }
  if (!orderedKeys.length) {
    orderedKeys = Object.keys(BUNDLE);
  }
}

function attachDerivedFields(map) {
  let sessionChain = null;
  try {
    const app = getApp();
    const s = app && app.globalData && app.globalData.learningSessionKeys;
    if (s && s.length) {
      sessionChain = s.map((x) => String(x || "").toLowerCase()).filter((x) => map[x]);
    }
  } catch (e) {
    warn("wordRegistry", "读取 learningSessionKeys 失败，改用全表顺序", e);
  }

  const allKeys = orderedKeys.filter((k) => map[k]);
  const chainKeys = sessionChain && sessionChain.length ? sessionChain : allKeys;

  allKeys.forEach((k) => {
    const wd = map[k];
    const sp = splitMeaningCombined(wd.meaning);
    if (!wd.pos && sp.pos) {
      wd.pos = sp.pos;
      wd.meaning = sp.meaning;
    } else if (wd.pos && sp.pos) {
      wd.meaning = sp.meaning;
    }
    if (!wd.examples || !wd.examples.length) {
      wd.examples = [
        {
          enPre: "",
          enHighlight: wd.word,
          enPost: ".",
          cn: wd.meaning || "",
        },
      ];
    } else {
      wd.examples = wd.examples.map((ex) => ensureExampleShape(ex, wd.word));
    }
    if (!wd.inflections) wd.inflections = [];
    if (!wd.collocations) wd.collocations = [];
    const ex0 = wd.examples[0];
    if (wd.sentencePre === undefined) wd.sentencePre = ex0.enPre;
    if (wd.sentenceHighlight === undefined) wd.sentenceHighlight = ex0.enHighlight;
    if (wd.sentencePost === undefined) wd.sentencePost = ex0.enPost;
    if (wd.sentenceCn === undefined) wd.sentenceCn = ex0.cn;
    /* 下一词只跟「本组 learningSessionKeys」走，禁止回退全表顺序（否则会跳回 abandon 等重复词） */
    if (sessionChain && sessionChain.length) {
      const idx = sessionChain.indexOf(k);
      wd.nextWord = idx >= 0 && idx < sessionChain.length - 1 ? sessionChain[idx + 1] : "";
    } else {
      const ia = allKeys.indexOf(k);
      wd.nextWord = ia >= 0 && ia < allKeys.length - 1 ? allKeys[ia + 1] : "";
    }
  });
}

function buildMergedMap() {
  if (mergedCache) return mergedCache;
  const map = {};
  Object.keys(BUNDLE).forEach((k) => {
    map[k] = clone(BUNDLE[k]);
  });
  Object.keys(overlay).forEach((k) => {
    map[k] = { ...overlay[k] };
  });
  attachDerivedFields(map);
  mergedCache = map;
  return map;
}

function persist() {
  try {
    wx.setStorageSync(CACHE_KEY, {
      overlay,
      orderedKeys,
      ts: Date.now(),
    });
  } catch (e) {
    warn("wordRegistry", "写入词库缓存失败", e);
  }
}

/** 按当前词表顺序取前 count 个（用于一组学习/复习） */
function getOrderedBatchKeys(count) {
  initWordRegistry();
  const map = buildMergedMap();
  const keys = orderedKeys.filter((k) => map[k]);
  const n = Math.max(1, Math.min(keys.length, Number(count) || 1));
  return keys.slice(0, n);
}

/** 合并词表词条总数（用于待学习数初始化） */
function getMergedWordCount() {
  initWordRegistry();
  const map = buildMergedMap();
  return orderedKeys.filter((k) => map[k]).length;
}

const FALLBACK_ROUND_WORDS = ["abandon", "absorb", "adapt", "benefit"];

/** 与 learningRound1Progress 共用：首轮词序备份到本地，避免 globalData 未带上栈时进度一直是 0 */
const LEARNING_SESSION_KEYS_STORAGE = "LEARNING_SESSION_KEYS_V1";
const LEARNING_NEXT_INDEX_STORAGE = "LEARNING_NEXT_INDEX_V1";

function persistLearningSessionKeys(words) {
  try {
    wx.setStorageSync(LEARNING_SESSION_KEYS_STORAGE, JSON.stringify(words || []));
  } catch (e) {
    warn("wordRegistry", "写入 learningSessionKeys 失败", e);
  }
}

/**
 * 首轮进度条用：与 beginLearningSession 写入的一致（global → 本地备份 → 当前词表前 N 个）
 */
function getLearningSessionKeysSnapshot() {
  try {
    const app = getApp();
    const s = app && app.globalData && app.globalData.learningSessionKeys;
    if (Array.isArray(s) && s.length) {
      return normalizeSessionKeys(s);
    }
  } catch (e) {
    warn("wordRegistry", "读取 globalData.learningSessionKeys 失败", e);
  }
  try {
    const raw = wx.getStorageSync(LEARNING_SESSION_KEYS_STORAGE);
    if (raw !== undefined && raw !== null && raw !== "") {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return normalizeSessionKeys(parsed);
      }
    }
  } catch (e) {
    warn("wordRegistry", "读取本地 learningSessionKeys 失败", e);
  }
  let fb = getNextLearningBatchKeys(getStudyWordsPerGroup());
  if (!fb.length) fb = FALLBACK_ROUND_WORDS.slice();
  return normalizeSessionKeys(fb);
}

/**
 * 云词库同步后：若无进行中学习断点且当前会话词数少于设置，用完整词表重建一组。
 */
function ensureLearningSessionMatchesSettings(app) {
  if (!app || !app.globalData) return;
  if (app.globalData._learningSessionLocked) return;
  let hasCheckpoint = false;
  try {
    const raw = wx.getStorageSync("STUDY_FLOW_CHECKPOINT_V1");
    hasCheckpoint = !!(raw && raw.path && raw.sig);
  } catch (e) {
    warn("wordRegistry", "读取学习断点失败，按无断点处理", e);
  }
  if (hasCheckpoint) return;

  const n = getStudyWordsPerGroup();
  const current = normalizeSessionKeys(app.globalData.learningSessionKeys || []);
  if (current.length >= n) return;

  const merged = getMergedWordCount();
  if (merged < n) return;

  let words = getNextLearningBatchKeys(n);
  if (!words.length) words = FALLBACK_ROUND_WORDS.slice();
  words = normalizeSessionKeys(words);
  if (!words.length || words.length <= current.length) return;

  app.globalData.learningSessionKeys = words.slice();
  persistLearningSessionKeys(words.slice());
  invalidateMergedCache();
  app.globalData.round2State = {
    words: words.slice(),
    progress: 0,
    progressBarTotal: words.length,
    currentIndex: 0,
    pendingChoice: "",
    unmastered: [],
    recallSingleNextByWord: {},
    masteredByWord: {},
  };
  app.globalData.round3State = null;
}

function getOrderedLearnableKeys() {
  initWordRegistry();
  const map = buildMergedMap();
  return orderedKeys.filter((k) => map[k]);
}

function readLearningNextIndex(total) {
  try {
    const raw = wx.getStorageSync(LEARNING_NEXT_INDEX_STORAGE);
    if (raw === "" || raw === undefined || raw === null) {
      const stats = wx.getStorageSync("APP_STATS_HUB_V1");
      const learnedFromPending =
        stats && typeof stats.lastRegistryWordTotal === "number" && typeof stats.pendingLearnCount === "number"
          ? stats.lastRegistryWordTotal - stats.pendingLearnCount
          : 0;
      const learned = Math.max(
        0,
        Math.floor(Number(learnedFromPending || (stats && stats.lifetimeWords) || 0) || 0)
      );
      return total > 0 ? learned % total : 0;
    }
    const n = Math.floor(Number(raw) || 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (total > 0 && n >= total) return 0;
    return n;
  } catch (e) {
    warn("wordRegistry", "readLearningNextIndex failed", e);
    return 0;
  }
}

function persistLearningNextIndex(index) {
  try {
    wx.setStorageSync(LEARNING_NEXT_INDEX_STORAGE, Math.max(0, Math.floor(Number(index) || 0)));
  } catch (e) {
    warn("wordRegistry", "写入 LEARNING_NEXT_INDEX 失败", e);
  }
}

/** 新学会话用：从上次学完的位置继续取下一组；全部学完后从头开始新周期。 */
function getNextLearningBatchKeys(count) {
  const keys = getOrderedLearnableKeys();
  if (!keys.length) return [];
  const start = readLearningNextIndex(keys.length);
  const n = Math.max(1, Math.min(keys.length, Number(count) || 1));
  return keys.slice(start, Math.min(keys.length, start + n));
}

function markLearningBatchCompleted(wordKeys) {
  const keys = getOrderedLearnableKeys();
  if (!keys.length) return;
  const completed = normalizeSessionKeys(wordKeys);
  if (!completed.length) return;

  let maxIndex = -1;
  completed.forEach((w) => {
    const idx = keys.indexOf(w);
    if (idx > maxIndex) maxIndex = idx;
  });
  if (maxIndex < 0) return;

  persistLearningNextIndex(maxIndex + 1 >= keys.length ? 0 : maxIndex + 1);
}

function beginLearningSession(app) {
  if (!app || !app.globalData) return;
  try {
    const { clearLearningCheckpoint } = require("./studyFlowCheckpoint.js");
    clearLearningCheckpoint();
  } catch (e) {
    warn("wordRegistry", "清理学习断点失败，继续开始新会话", e);
  }
  const map = getMergedMap();
  let words = getNextLearningBatchKeys(getStudyWordsPerGroup());
  words = normalizeSessionKeys(words).filter((k) => map[k]);
  if (!words.length) words = FALLBACK_ROUND_WORDS.slice().filter((k) => map[k]);
  if (!words.length) words = FALLBACK_ROUND_WORDS.slice();
  app.globalData._learningSessionLocked = true;
  app.globalData.learningSessionKeys = words.slice();
  persistLearningSessionKeys(words.slice());
  invalidateCache();
  app.globalData._studyGroupStatsRecorded = false;
  app.globalData.round3State = null;
  app.globalData.round2State = {
    words: words.slice(),
    progress: 0,
    progressBarTotal: words.length,
    currentIndex: 0,
    pendingChoice: "",
    unmastered: [],
    recallSingleNextByWord: {},
    masteredByWord: {},
  };
  try {
    const { prefetchLearningSessionWordImages } = require("./wordImageCloud.js");
    prefetchLearningSessionWordImages(words);
  } catch (e) {
    warn("wordRegistry", "预取学习会话图片失败，不影响主流程", e);
  }
}

function getLearningSessionFirstKey() {
  try {
    const app = getApp();
    const s = app && app.globalData && app.globalData.learningSessionKeys;
    if (s && s[0] && getMergedMap()[String(s[0]).toLowerCase()]) {
      return String(s[0]).toLowerCase();
    }
  } catch (e) {
    warn("wordRegistry", "读取会话首词失败，回退默认词", e);
  }
  return getDefaultWordKey();
}

function applyCloudWords(overlayNew, orderedFromCloud) {
  initWordRegistry();
  const cloudKeys = Array.isArray(orderedFromCloud) ? orderedFromCloud.slice() : [];
  if (!cloudKeys.length) {
    return;
  }
  overlay = { ...overlayNew };
  const seen = {};
  const mergedOrder = [];
  cloudKeys.forEach((k) => {
    const key = String(k).toLowerCase();
    if (!seen[key]) {
      mergedOrder.push(key);
      seen[key] = true;
    }
  });
  Object.keys(BUNDLE).forEach((k) => {
    if (!seen[k]) {
      mergedOrder.push(k);
      seen[k] = true;
    }
  });
  orderedKeys = mergedOrder;
  invalidateCache();
  persist();
  /* 云库刷新只更新词表顺序与 overlay，不得覆盖 learningSessionKeys / round2State：
   * 否则异步返回后会把「当前一组」换成云端排序的前 N 个词，
   * attachDerivedFields 里当前词不在新链上 → nextWord 为空，第二词及后续页跳不过去。 */
}

function getMergedMap() {
  initWordRegistry();
  return buildMergedMap();
}

/** 学习流 URL 上的词：只要在本次 session 里就保留，避免云库未就绪时退回第一个词 */
function resolveLearningWordKey(queryWord) {
  const q = normalizeWordKey(queryWord);
  const session = getLearningSessionKeysSnapshot();
  if (q && session.length && session.includes(q)) return q;
  if (q && getMergedMap()[q]) return q;
  const first = getLearningSessionFirstKey();
  if (first) return first;
  return getDefaultWordKey();
}

function getNextWordInLearningSession(wordKey) {
  const keys = getLearningSessionKeysSnapshot();
  const k = normalizeWordKey(wordKey);
  const i = keys.indexOf(k);
  if (i < 0 || i >= keys.length - 1) return "";
  return keys[i + 1];
}

function getPrevWordInLearningSession(wordKey) {
  const keys = getLearningSessionKeysSnapshot();
  const k = normalizeWordKey(wordKey);
  const i = keys.indexOf(k);
  if (i <= 0) return "";
  return keys[i - 1];
}

function releaseLearningSessionLock() {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData._learningSessionLocked = false;
  } catch (e) {
    warn("wordRegistry", "释放学习会话锁失败", e);
  }
}

function getWordData(key) {
  const k = String(key || "abandon").toLowerCase();
  const map = getMergedMap();
  const raw = map[k];
  if (raw) return clone(raw);
  if (map.abandon) return clone(map.abandon);
  return clone(BUNDLE.abandon || emptyWordPlaceholder(k));
}

function hasWord(key) {
  const k = normalizeWordKey(key);
  return !!getMergedMap()[k];
}

function getDefaultWordKey() {
  initWordRegistry();
  return orderedKeys[0] || "abandon";
}

/** 当前合并词表中单词的 1-based 顺序（与云存储「0001_单词.jpg」编号对齐用） */
function getOrderedWordIndex1Based(wordKey) {
  initWordRegistry();
  const map = buildMergedMap();
  const k = String(wordKey || "").toLowerCase().trim();
  if (!k || !map[k]) return 0;
  const keys = orderedKeys.filter((x) => map[x]);
  const idx = keys.indexOf(k);
  if (idx < 0) return 0;
  return idx + 1;
}

/** AI Memory 列表行 */
function getWordBankRows() {
  initWordRegistry();
  const map = getMergedMap();
  return orderedKeys
    .filter((k) => map[k])
    .map((k) => {
      const w = map[k];
      let pos = w.pos || "";
      let meaning = w.meaning || "";
      if (!pos && meaning) {
        const sp = meaning.match(/^([a-z]+\.)\s*(.+)$/i);
        if (sp) {
          pos = sp[1];
          meaning = sp[2];
        }
      }
      return {
        word: w.word,
        pos,
        meaning,
        selected: false,
      };
    });
}

module.exports = {
  initWordRegistry,
  applyCloudWords,
  getWordData,
  hasWord,
  normalizeWordKey,
  getDefaultWordKey,
  getOrderedWordIndex1Based,
  getWordBankRows,
  getOrderedBatchKeys,
  getMergedWordCount,
  beginLearningSession,
  getNextLearningBatchKeys,
  markLearningBatchCompleted,
  getLearningSessionFirstKey,
  getLearningSessionKeysSnapshot,
  resolveLearningWordKey,
  getNextWordInLearningSession,
  getPrevWordInLearningSession,
  releaseLearningSessionLock,
  ensureLearningSessionMatchesSettings,
  normalizeSessionKeys,
  persistLearningSessionKeys,
  invalidateMergedCache,
  LEARNING_NEXT_INDEX_STORAGE,
  LEARNING_SESSION_KEYS_STORAGE,
  /** 兼容旧代码：与合并后词条同步的只读访问 */
  get WORD_DATA() {
    return getMergedMap();
  },
};
