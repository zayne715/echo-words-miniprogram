const test = require("node:test");
const assert = require("node:assert/strict");

// Re-use the shared wx mock set up by studySettings.test.js (or initialise here
// if this file happens to run first in the same process).
if (!global.__mockStorage) global.__mockStorage = {};
if (!global.wx) {
  global.wx = {
    getStorageSync: (key) =>
      Object.prototype.hasOwnProperty.call(global.__mockStorage, key)
        ? global.__mockStorage[key]
        : "",
    setStorageSync: (key, val) => {
      global.__mockStorage[key] = val;
    },
    removeStorageSync: (key) => {
      delete global.__mockStorage[key];
    },
  };
}

const {
  GRADUATED_STEP,
  GRADUATED_NEXT_DAYS,
  onLearnGroupCompleted,
  onReviewWordsCompletedToday,
  getDueWordKeys,
  getDueReviewCount,
  pickDueWordsForSession,
  todayKey,
} = require("../miniprogram/utils/reviewSchedule.js");

/** Clear only review-schedule storage keys between tests */
function clearScheduleStorage() {
  delete global.__mockStorage["REVIEW_SCHEDULE_V1"];
  delete global.__mockStorage["REVIEW_TODAY_KEYS_V1"];
}

// --- constants ---

test("reviewSchedule GRADUATED_STEP and GRADUATED_NEXT_DAYS are positive integers", () => {
  assert.ok(Number.isInteger(GRADUATED_STEP) && GRADUATED_STEP > 0);
  assert.ok(Number.isInteger(GRADUATED_NEXT_DAYS) && GRADUATED_NEXT_DAYS > 365);
});

// --- onLearnGroupCompleted + getDueWordKeys ---

test("reviewSchedule onLearnGroupCompleted schedules words as due today", () => {
  clearScheduleStorage();
  onLearnGroupCompleted(["abandon", "absorb"], todayKey());
  const due = getDueWordKeys();
  assert.ok(due.includes("abandon"), "abandon should be due");
  assert.ok(due.includes("absorb"), "absorb should be due");
});

test("reviewSchedule onLearnGroupCompleted with empty list adds no words", () => {
  clearScheduleStorage();
  onLearnGroupCompleted([], todayKey());
  assert.equal(getDueReviewCount(), 0);
});

test("reviewSchedule onLearnGroupCompleted normalises word keys to lowercase", () => {
  clearScheduleStorage();
  onLearnGroupCompleted(["Abandon"], todayKey());
  const due = getDueWordKeys();
  assert.ok(due.includes("abandon"), "key should be normalised to lowercase");
});

// --- getDueReviewCount ---

test("reviewSchedule getDueReviewCount matches number of due words", () => {
  clearScheduleStorage();
  onLearnGroupCompleted(["adapt", "benefit"], todayKey());
  assert.equal(getDueReviewCount(), 2);
});

// --- pickDueWordsForSession ---

test("reviewSchedule pickDueWordsForSession respects maxN limit", () => {
  clearScheduleStorage();
  onLearnGroupCompleted(["w1", "w2", "w3", "w4", "w5"], todayKey());
  const picked = pickDueWordsForSession(3);
  assert.equal(picked.length, 3);
});

test("reviewSchedule pickDueWordsForSession returns all when n >= due count", () => {
  clearScheduleStorage();
  onLearnGroupCompleted(["cat", "dog"], todayKey());
  const picked = pickDueWordsForSession(10);
  assert.equal(picked.length, 2);
});

// --- onReviewWordsCompletedToday ---

test("reviewSchedule onReviewWordsCompletedToday removes words from today's queue", () => {
  clearScheduleStorage();
  onLearnGroupCompleted(["accept"], todayKey());
  assert.equal(getDueReviewCount(), 1);
  onReviewWordsCompletedToday(["accept"]);
  assert.equal(getDueReviewCount(), 0);
});

test("reviewSchedule onReviewWordsCompletedToday advances step for reviewed words", () => {
  clearScheduleStorage();
  const today = todayKey();
  onLearnGroupCompleted(["evolve"], today);
  onReviewWordsCompletedToday(["evolve"]);
  // After step 0 → 1, next due is today + GAPS[0] = today + 1 day, so NOT due today
  assert.equal(getDueReviewCount(), 0);
});

test("reviewSchedule reviewing word not in schedule is silently ignored", () => {
  clearScheduleStorage();
  // Should not throw
  onReviewWordsCompletedToday(["nonexistent"]);
  assert.equal(getDueReviewCount(), 0);
});
