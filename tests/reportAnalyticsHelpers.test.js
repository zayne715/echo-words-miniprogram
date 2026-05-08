const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clampInt,
  validDateKey,
  buildAnalyticsDocId,
  buildAnalyticsIncrementPatch,
  MAX_DAILY_REPORT_CALLS,
} = require("../cloudfunctions/reportAnalytics/helpers.js");

test("report analytics clamp and date validator", () => {
  assert.equal(clampInt(-1, 0, 10), 0);
  assert.equal(clampInt(99, 0, 10), 10);
  assert.equal(clampInt(5.9, 0, 10), 5);
  assert.equal(validDateKey("2026-06-25"), "2026-06-25");
  assert.equal(validDateKey("2026/06/25"), "");
});

test("report analytics deterministic doc id", () => {
  assert.equal(buildAnalyticsDocId("openid123", "2026-06-25"), "openid123::2026-06-25");
});

test("report analytics increment patch helper", () => {
  const fakeDb = {
    serverDate() {
      return "SERVER_DATE";
    },
    command: {
      inc(v) {
        return { $inc: v };
      },
    },
  };
  const patch = buildAnalyticsIncrementPatch(fakeDb, {
    wordsLearned: 2,
    studyMsDelta: 30,
    wordsReviewed: 0,
    reviewMsDelta: 8,
    appOpenInc: 1,
  });
  assert.deepEqual(patch, {
    updatedAt: "SERVER_DATE",
    callCount: { $inc: 1 },
    wordsLearned: { $inc: 2 },
    studyMs: { $inc: 30 },
    reviewMs: { $inc: 8 },
    appOpenCount: { $inc: 1 },
  });
});

test("MAX_DAILY_REPORT_CALLS is a positive integer above normal usage", () => {
  assert.ok(typeof MAX_DAILY_REPORT_CALLS === "number");
  assert.ok(MAX_DAILY_REPORT_CALLS > 10);
  assert.ok(Number.isInteger(MAX_DAILY_REPORT_CALLS));
});
