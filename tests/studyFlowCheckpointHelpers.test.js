const test = require("node:test");
const assert = require("node:assert/strict");

const {
  reviewSigFromWords,
  clampProgress,
  extractWordFromPath,
} = require("../miniprogram/utils/studyFlowCheckpointHelpers.js");

test("studyFlowCheckpointHelpers reviewSigFromWords should normalize and sort", () => {
  const sig = reviewSigFromWords([" Absorb ", "adapt", "absorb"]);
  assert.equal(sig, "absorb|adapt");
});

test("studyFlowCheckpointHelpers clampProgress should clamp range", () => {
  assert.equal(clampProgress(-1, 10), 0);
  assert.equal(clampProgress(11, 10), 10);
  assert.equal(clampProgress(3, 10), 3);
});

test("studyFlowCheckpointHelpers extractWordFromPath should parse query word", () => {
  assert.equal(extractWordFromPath("/pages/review-word/index?word=Absorb"), "absorb");
});
