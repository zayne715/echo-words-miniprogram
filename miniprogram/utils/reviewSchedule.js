/**
 * 复习间隔（天）：学完后第1次当日，之后相对「上次完成日」顺延 +1,+2,+4,+8,+15 天。
 * 到期未做跨日累积；当日已复习的词不再出现在当日队列。
 */

const { warn } = require("./devLogger.js");

const STORAGE_KEY = "REVIEW_SCHEDULE_V1";
const GAPS_AFTER_STEP = [1, 2, 4, 8, 15];

/** step 达到此值后视为「毕业」，下次复习间隔设为 GRADUATED_NEXT_DAYS */
const GRADUATED_STEP = 6;
/** 毕业后的虚拟复习间隔（天）：约 10 年，相当于不再安排复习 */
const GRADUATED_NEXT_DAYS = 3650;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dayKeyFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayKey(key) {
  const p = String(key || "").split("-");
  if (p.length !== 3) return null;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function addDaysKey(dayKey, deltaDays) {
  const d = parseDayKey(dayKey);
  if (!d) return dayKeyFromDate(new Date());
  d.setDate(d.getDate() + deltaDays);
  return dayKeyFromDate(d);
}

function loadMap() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (raw && typeof raw === "object") return raw;
  } catch (e) {
    warn("reviewSchedule", "loadMap failed", e);
  }
  return {};
}

function saveMap(m) {
  try {
    wx.setStorageSync(STORAGE_KEY, m);
  } catch (e) {
    warn("reviewSchedule", "saveMap failed", e);
  }
}

function todayKey() {
  return dayKeyFromDate(new Date());
}

function loadReviewedToday() {
  const tk = todayKey();
  try {
    const raw = wx.getStorageSync("REVIEW_TODAY_KEYS_V1");
    if (raw && raw.day === tk && Array.isArray(raw.keys)) return new Set(raw.keys);
  } catch (e) {
    warn("reviewSchedule", "loadReviewedToday failed", e);
  }
  return new Set();
}

function saveReviewedToday(set) {
  const tk = todayKey();
  try {
    wx.setStorageSync("REVIEW_TODAY_KEYS_V1", { day: tk, keys: Array.from(set) });
  } catch (e) {
    warn("reviewSchedule", "saveReviewedToday failed", e);
  }
}

function getWordEntry(map, word) {
  const k = String(word || "").toLowerCase().trim();
  return { k, e: map[k] || null };
}

/**
 * 学习完一组：为每个词建立/更新计划，第一次复习为「学习当日」。
 */
function onLearnGroupCompleted(wordKeys, learnDayKey) {
  const map = loadMap();
  const day0 = learnDayKey || todayKey();
  (wordKeys || []).forEach((w) => {
    const { k } = getWordEntry(map, w);
    if (!k) return;
    map[k] = {
      learnedDayKey: day0,
      step: 0,
      nextDueKey: day0,
      lastCompletedKey: "",
    };
  });
  saveMap(map);
}

/**
 * 完成一次复习会话：对当日完成的词推进 step，并按「上次完成日 + 间隔」写下次到期日。
 */
function onReviewWordsCompletedToday(wordKeys) {
  const map = loadMap();
  const doneDay = todayKey();
  const reviewed = loadReviewedToday();
  (wordKeys || []).forEach((w) => {
    const { k, e } = getWordEntry(map, w);
    if (!k || !e) return;
    reviewed.add(k);
    const step = typeof e.step === "number" ? e.step : 0;
    const lastDone = doneDay;
    let nextDue = lastDone;
    if (step >= GRADUATED_STEP) {
      nextDue = addDaysKey(lastDone, GRADUATED_NEXT_DAYS);
    } else {
      const gap = GAPS_AFTER_STEP[step] != null ? GAPS_AFTER_STEP[step] : 1;
      nextDue = addDaysKey(lastDone, gap);
    }
    map[k] = {
      ...e,
      step: Math.min(6, step + 1),
      lastCompletedKey: lastDone,
      nextDueKey: nextDue,
    };
  });
  saveReviewedToday(reviewed);
  saveMap(map);
}

function isDue(e, today) {
  if (!e || !e.nextDueKey) return false;
  return String(e.nextDueKey) <= String(today);
}

function getDueWordKeys() {
  const map = loadMap();
  const tk = todayKey();
  const reviewed = loadReviewedToday();
  const out = [];
  Object.keys(map).forEach((k) => {
    const e = map[k];
    if (!isDue(e, tk)) return;
    if (reviewed.has(k)) return;
    out.push(k);
  });
  return out;
}

function getDueReviewCount() {
  return getDueWordKeys().length;
}

function pickDueWordsForSession(maxN) {
  const all = getDueWordKeys();
  const n = Math.max(1, Math.min(20, Number(maxN) || 4));
  return all.slice(0, n);
}

module.exports = {
  GRADUATED_STEP,
  GRADUATED_NEXT_DAYS,
  onLearnGroupCompleted,
  onReviewWordsCompletedToday,
  getDueReviewCount,
  getDueWordKeys,
  pickDueWordsForSession,
  todayKey,
};
