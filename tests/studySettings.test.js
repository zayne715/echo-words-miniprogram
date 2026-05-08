const test = require("node:test");
const assert = require("node:assert/strict");

// Shared wx mock storage — keyed off global so all test files can coexist in the
// same Node process. Each test clears only its own storage keys to avoid pollution.
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
  clampWord,
  getStudyWordsPerGroup,
  getReviewWordsPerGroup,
  DEFAULT_STUDY,
  DEFAULT_REVIEW,
  WORD_MIN,
  WORD_MAX,
  STORAGE_STUDY,
  STORAGE_REVIEW,
} = require("../miniprogram/utils/studySettings.js");

// --- clampWord ---

test("studySettings clampWord clamps below min to WORD_MIN", () => {
  assert.equal(clampWord(0), WORD_MIN);
  assert.equal(clampWord(-5), WORD_MIN);
});

test("studySettings clampWord clamps above max to WORD_MAX", () => {
  assert.equal(clampWord(25), WORD_MAX);
  assert.equal(clampWord(999), WORD_MAX);
});

test("studySettings clampWord keeps in-range value unchanged", () => {
  assert.equal(clampWord(1), 1);
  assert.equal(clampWord(10), 10);
  assert.equal(clampWord(20), 20);
});

test("studySettings clampWord rounds fractional values", () => {
  assert.equal(clampWord(5.6), 6);
  assert.equal(clampWord(5.4), 5);
});

test("studySettings clampWord falls back to DEFAULT_STUDY on NaN input", () => {
  // String that can't be parsed → NaN → fallback to DEFAULT_STUDY
  assert.equal(clampWord("abc"), DEFAULT_STUDY);
  // Number(null) === 0 → NOT NaN → clamped to WORD_MIN, not the fallback
  assert.equal(clampWord(null), WORD_MIN);
});

test("studySettings clampWord uses custom fallback on NaN input", () => {
  assert.equal(clampWord("bad", 7), 7);
});

// --- getStudyWordsPerGroup ---

test("studySettings getStudyWordsPerGroup returns DEFAULT_STUDY when storage is empty", () => {
  delete global.__mockStorage[STORAGE_STUDY];
  assert.equal(getStudyWordsPerGroup(), DEFAULT_STUDY);
});

test("studySettings getStudyWordsPerGroup returns stored valid value", () => {
  global.__mockStorage[STORAGE_STUDY] = 15;
  assert.equal(getStudyWordsPerGroup(), 15);
  delete global.__mockStorage[STORAGE_STUDY];
});

test("studySettings getStudyWordsPerGroup clamps out-of-range stored value", () => {
  global.__mockStorage[STORAGE_STUDY] = 99;
  assert.equal(getStudyWordsPerGroup(), WORD_MAX);
  delete global.__mockStorage[STORAGE_STUDY];
});

// --- getReviewWordsPerGroup ---

test("studySettings getReviewWordsPerGroup returns DEFAULT_REVIEW when storage is empty", () => {
  delete global.__mockStorage[STORAGE_REVIEW];
  assert.equal(getReviewWordsPerGroup(), DEFAULT_REVIEW);
});

test("studySettings getReviewWordsPerGroup returns stored valid value", () => {
  global.__mockStorage[STORAGE_REVIEW] = 8;
  assert.equal(getReviewWordsPerGroup(), 8);
  delete global.__mockStorage[STORAGE_REVIEW];
});

test("studySettings getReviewWordsPerGroup clamps out-of-range stored value", () => {
  global.__mockStorage[STORAGE_REVIEW] = 0;
  assert.equal(getReviewWordsPerGroup(), WORD_MIN);
  delete global.__mockStorage[STORAGE_REVIEW];
});
