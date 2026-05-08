/**
 * 首页 Words TAB「This Week」与 Me TAB 累计/柱状图（本地持久化）。
 *
 * 更新时机：仅当用户完整学完或复习完一整组时写入（round-complete / review-complete）。
 *
 * Words TAB — This Week（会清零）：
 * - 周期：用户第一次完成学习或复习组的那天为第 1 天；满 7 个自然日后（第 7 天 24:00 进入第 8 天）周数据清零并进入下一周期。
 * - words：只统计本周期内「学习」组完成的词数（复习不计入）。
 * - min learned：本周期学习时长 + 复习时长。
 * - days studied：本周期内有过学习或复习（或两者）的自然日数，每日最多计 1 天。
 *
 * Me TAB（不清零）：
 * - Words Learned / Study Time / Days Learned：全生命周期累计（同上口径，时间含学习+复习，天数含学习或复习）。
 * - Last 7 Days 柱状图：最近 7 个自然日每天学习+复习总时长（毫秒累计）；学完/复习完一组即累加，柱高按近 7 日相对比例变长。
 */

const { warn } = require("./devLogger.js");

const STORAGE_KEY = "APP_STATS_HUB_V1";

const BAR_EMPTY_PX = 4;
const BAR_MIN_PX = 14;
const BAR_MAX_PX = 64;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dayKeyFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayKey(key) {
  const p = String(key || "").split("-");
  if (p.length !== 3) return null;
  const y = Number(p[0]);
  const m = Number(p[1]) - 1;
  const dom = Number(p[2]);
  if (!y || m < 0 || m > 11 || !dom) return null;
  return new Date(y, m, dom);
}

function daysBetweenKeys(a, b) {
  const da = parseDayKey(a);
  const db = parseDayKey(b);
  if (!da || !db) return 0;
  const t = (db - da) / 86400000;
  return Math.floor(t);
}

function defaultState() {
  return {
    /** 本周周期起点（自然日 key）；空表示尚未因学习/复习锚定，不计入「第几天」 */
    weekCycleStartKey: "",
    /** 是否已锚定：老数据无此字段但有 startKey 时视为已锚定 */
    weekCycleAnchored: false,
    weekWordsLearned: 0,
    weekStudyMs: 0,
    weekReviewMs: 0,
    weekActivity: [false, false, false, false, false, false, false],
    encourageVisible: false,
    encourageCard0: "",
    encourageCard1: "",
    encourageCard2: "",
    pendingLearnCount: 0,
    pendingLearnInited: false,
    /** 与「合并词表」总词条数对齐，用于云库从 bundle 扩容时校正待学数 */
    lastRegistryWordTotal: 0,
    last7Minutes: {},
    /** 自然日 key → 当日学习+复习总毫秒（柱状图与累计时长来源） */
    dailyStudyReviewMs: {},
    lifetimeWords: 0,
    lifetimeStudyMs: 0,
    lifetimeLearnDayKeys: [],
  };
}

function loadState() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (raw && typeof raw === "object") {
      const s = { ...defaultState(), ...raw };
      if (!("weekCycleAnchored" in raw) && s.weekCycleStartKey) {
        s.weekCycleAnchored = true;
        saveState(s);
      }
      /* 老版本在云同步前用本地词表条数初始化，导致待学数锁在 24 等错误值；一次性解锁后由云合并总数重新对齐 */
      if (!("pendingLearnRegistrySyncV2" in raw) || raw.pendingLearnRegistrySyncV2 !== true) {
        s.pendingLearnRegistrySyncV2 = true;
        s.pendingLearnInited = false;
        s.lastRegistryWordTotal = 0;
        saveState(s);
      }
      migrateDailyMsFromLegacy(s);
      return s;
    }
  } catch (e) {
    warn("appStatsHub", "loadState failed, using defaults", e);
  }
  const s = defaultState();
  s.pendingLearnRegistrySyncV2 = true;
  return s;
}

function saveState(s) {
  try {
    wx.setStorageSync(STORAGE_KEY, s);
  } catch (e) {
    warn("appStatsHub", "saveState failed", e);
  }
}

function resetWeekCounters(s) {
  s.weekWordsLearned = 0;
  s.weekStudyMs = 0;
  s.weekReviewMs = 0;
  s.weekActivity = [false, false, false, false, false, false, false];
  s.encourageVisible = false;
  s.encourageCard0 = "";
  s.encourageCard1 = "";
  s.encourageCard2 = "";
}

function maybeRotateWeekCycle(s) {
  const today = dayKeyFromDate(new Date());
  const start = s.weekCycleStartKey || "";
  if (!start || !parseDayKey(start)) {
    if (!Array.isArray(s.weekActivity) || s.weekActivity.length !== 7) {
      s.weekActivity = [false, false, false, false, false, false, false];
    }
    return false;
  }
  const elapsed = daysBetweenKeys(start, today);
  if (elapsed < 7) {
    if (!Array.isArray(s.weekActivity) || s.weekActivity.length !== 7) {
      s.weekActivity = [false, false, false, false, false, false, false];
    }
    return false;
  }
  /* 满 7 日（第 8 天 0 点起）进入新周期：周统计清零，锚点前进到当前所在周期首日 */
  const periods = Math.floor(elapsed / 7);
  const anchor = parseDayKey(start);
  anchor.setDate(anchor.getDate() + periods * 7);
  s.weekCycleStartKey = dayKeyFromDate(anchor);
  s.weekCycleAnchored = true;
  resetWeekCounters(s);
  return true;
}

function weekDayIndex(s) {
  const today = dayKeyFromDate(new Date());
  const start = s.weekCycleStartKey || "";
  if (!start || !parseDayKey(start)) return 0;
  const d = daysBetweenKeys(start, today);
  return Math.min(6, Math.max(0, d));
}

function markWeekActivity(s) {
  const i = weekDayIndex(s);
  s.weekActivity[i] = true;
}

/** 本周周期内已发生学习或复习的自然日数（0–7） */
function countWeekDaysStudied(s) {
  const arr = Array.isArray(s.weekActivity) ? s.weekActivity : [];
  return arr.filter(Boolean).length;
}

function ensureWeekCycleStarted(s, todayKey) {
  const k = String(todayKey || "").trim();
  if (!k) return;
  if (s.weekCycleStartKey && parseDayKey(s.weekCycleStartKey)) {
    s.weekCycleAnchored = true;
    return;
  }
  s.weekCycleStartKey = k;
  s.weekCycleAnchored = true;
}

function ensureLast7Structure(s) {
  if (!s.last7Minutes || typeof s.last7Minutes !== "object") s.last7Minutes = {};
}

function ensureDailyMsStructure(s) {
  if (!s.dailyStudyReviewMs || typeof s.dailyStudyReviewMs !== "object") {
    s.dailyStudyReviewMs = {};
  }
}

/** 旧版仅存「分钟」时迁移为毫秒，避免柱高丢失 */
function migrateDailyMsFromLegacy(s) {
  ensureDailyMsStructure(s);
  if (Object.keys(s.dailyStudyReviewMs).length) return;
  const legacy = s.last7Minutes;
  if (!legacy || typeof legacy !== "object") return;
  Object.keys(legacy).forEach((k) => {
    const m = Number(legacy[k]) || 0;
    if (m > 0) s.dailyStudyReviewMs[k] = m * 60000;
  });
}

function minutesLabelFromMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n <= 0) return "0m";
  return `${Math.ceil(n / 60000)}m`;
}

function barHeightFromMs(ms, peakMs) {
  const v = Math.max(0, Number(ms) || 0);
  if (v <= 0) return BAR_EMPTY_PX;
  const peak = Math.max(Number(peakMs) || 0, v, 1);
  const ratio = v / peak;
  return Math.round(BAR_MIN_PX + ratio * (BAR_MAX_PX - BAR_MIN_PX));
}

function ensureWeekActivityShape(s) {
  if (!Array.isArray(s.weekActivity) || s.weekActivity.length !== 7) {
    s.weekActivity = [false, false, false, false, false, false, false];
  }
}

function formatHoursLabel(totalMs) {
  const h = totalMs / 3600000;
  if (h < 1) {
    const m = Math.max(0, Math.round(totalMs / 60000));
    return `${m} min`;
  }
  return `${(Math.round(h * 10) / 10).toFixed(1)} h`;
}

function formatWeekHoursLabel(studyMs, reviewMs) {
  return formatHoursLabel((studyMs || 0) + (reviewMs || 0));
}

function bumpLifetimeDay(s, dayKey) {
  const arr = Array.isArray(s.lifetimeLearnDayKeys) ? s.lifetimeLearnDayKeys.slice() : [];
  if (!arr.includes(dayKey)) {
    arr.push(dayKey);
    s.lifetimeLearnDayKeys = arr;
  }
}

/** Me 柱状图：按自然日累计学习+复习总时长（毫秒），学完/复习完一组追加 */
function recordMinutesOnDay(s, dayKey, deltaMs) {
  ensureDailyMsStructure(s);
  const dk = String(dayKey || "").trim();
  const add = Math.max(0, Number(deltaMs) || 0);
  if (!dk || add <= 0) return;
  const cur = typeof s.dailyStudyReviewMs[dk] === "number" ? s.dailyStudyReviewMs[dk] : 0;
  s.dailyStudyReviewMs[dk] = cur + add;
  ensureLast7Structure(s);
  s.last7Minutes[dk] = Math.ceil(s.dailyStudyReviewMs[dk] / 60000);
}

/**
 * 与合并词表（含云库）总词条数对齐「待学习」数：
 * - 首次：pending = 总词条数；
 * - 词表总数变化（如云同步后从 bundle 扩到全库）：按差值增减 pending，再随学完一组扣减。
 */
function ensurePendingLearnInitialized(totalWordCount) {
  const s = loadState();
  maybeRotateWeekCycle(s);
  const n = Math.max(0, Math.floor(Number(totalWordCount) || 0));
  if (n <= 0) {
    saveState(s);
    return;
  }
  const prevSnap =
    typeof s.lastRegistryWordTotal === "number" && s.lastRegistryWordTotal > 0
      ? s.lastRegistryWordTotal
      : 0;

  if (!s.pendingLearnInited) {
    s.pendingLearnCount = n;
    s.pendingLearnInited = true;
    s.lastRegistryWordTotal = n;
    saveState(s);
    return;
  }

  if (prevSnap > 0 && n !== prevSnap) {
    s.pendingLearnCount = Math.max(0, (s.pendingLearnCount || 0) + (n - prevSnap));
    s.lastRegistryWordTotal = n;
    saveState(s);
    return;
  }

  if (prevSnap === 0) {
    s.lastRegistryWordTotal = n;
    saveState(s);
  }
}

function recordStudyGroupCompleted(wordKeys, studyMs) {
  const s = loadState();
  const today = dayKeyFromDate(new Date());
  maybeRotateWeekCycle(s);
  ensureWeekCycleStarted(s, today);
  maybeRotateWeekCycle(s);
  const keys = (wordKeys || []).map((x) => String(x || "").toLowerCase()).filter(Boolean);
  const n = keys.length;
  const ms = Math.max(0, Number(studyMs) || 0);

  s.weekWordsLearned += n;
  s.weekStudyMs += ms;
  markWeekActivity(s);
  recordMinutesOnDay(s, today, ms);

  s.lifetimeWords += n;
  s.lifetimeStudyMs += ms;
  bumpLifetimeDay(s, today);

  if (n > 0) {
    s.pendingLearnCount = Math.max(0, (s.pendingLearnCount || 0) - n);
  }

  try {
    const { markLearningBatchCompleted } = require("./wordRegistry.js");
    markLearningBatchCompleted(keys);
  } catch (e) {
    warn("appStatsHub", "markLearningBatchCompleted failed", e);
  }

  s.encourageVisible = true;
  s.encourageCard0 = "Well done! ✔";
  s.encourageCard1 = "You're doing great! ✨";
  s.encourageCard2 = "Keep it up!";

  saveState(s);

  try {
    const { reportStudyGroupToCloud } = require("./analyticsReport.js");
    reportStudyGroupToCloud(today, n, ms);
  } catch (e) {
    warn("appStatsHub", "reportStudyGroupToCloud failed", e);
  }
}

function recordReviewGroupCompleted(wordKeys, reviewMs) {
  const s = loadState();
  const today = dayKeyFromDate(new Date());
  maybeRotateWeekCycle(s);
  ensureWeekCycleStarted(s, today);
  maybeRotateWeekCycle(s);
  const ms = Math.max(0, Number(reviewMs) || 0);

  s.weekReviewMs += ms;
  markWeekActivity(s);
  recordMinutesOnDay(s, today, ms);

  s.lifetimeStudyMs += ms;
  bumpLifetimeDay(s, today);

  saveState(s);

  try {
    const { reportReviewGroupToCloud } = require("./analyticsReport.js");
    const reviewedCount = (wordKeys || []).length;
    reportReviewGroupToCloud(today, reviewedCount, ms);
  } catch (e) {
    warn("appStatsHub", "reportReviewGroupToCloud failed", e);
  }
}

function getIndexPageSnapshot() {
  const s = loadState();
  if (maybeRotateWeekCycle(s)) saveState(s);
  ensureWeekActivityShape(s);
  return {
    pendingLearn: s.pendingLearnCount != null ? s.pendingLearnCount : 0,
    weekWords: s.weekWordsLearned || 0,
    weekDaysStudied: countWeekDaysStudied(s),
    weekHoursLabel: formatWeekHoursLabel(s.weekStudyMs, s.weekReviewMs),
    encourageVisible: !!s.encourageVisible,
    encourageCard0: s.encourageCard0 || "",
    encourageCard1: s.encourageCard1 || "",
    encourageCard2: s.encourageCard2 || "",
  };
}

function getMeLast7Bars() {
  const s = loadState();
  if (maybeRotateWeekCycle(s)) saveState(s);
  migrateDailyMsFromLegacy(s);
  const now = new Date();
  const todayKey = dayKeyFromDate(now);
  const rows = [];
  let peakMs = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKeyFromDate(d);
    const ms = typeof s.dailyStudyReviewMs[k] === "number" ? s.dailyStudyReviewMs[k] : 0;
    if (ms > peakMs) peakMs = ms;
    rows.push({
      ms,
      k,
      label: `${MONTH_SHORT[d.getMonth()]}/${d.getDate()}`,
      today: k === todayKey,
    });
  }
  return rows.map((row) => ({
    min: minutesLabelFromMs(row.ms),
    day: row.label,
    barHeightPx: barHeightFromMs(row.ms, peakMs),
    empty: row.ms <= 0,
    today: row.today,
  }));
}

function getMeLifetimeSnapshot() {
  const s = loadState();
  if (maybeRotateWeekCycle(s)) saveState(s);
  const days = Array.isArray(s.lifetimeLearnDayKeys) ? s.lifetimeLearnDayKeys.length : 0;
  return {
    totalWords: s.lifetimeWords || 0,
    totalHoursLabel: formatHoursLabel(s.lifetimeStudyMs || 0),
    totalDays: days,
  };
}

module.exports = {
  ensurePendingLearnInitialized,
  recordStudyGroupCompleted,
  recordReviewGroupCompleted,
  getIndexPageSnapshot,
  getMeLast7Bars,
  getMeLifetimeSnapshot,
  dayKeyFromDate,
};
