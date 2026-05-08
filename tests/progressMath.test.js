const test = require("node:test");
const assert = require("node:assert/strict");

const { clampProgress } = require("../miniprogram/utils/progressMath.js");

test("clampProgress should clamp to [0, total]", () => {
  const r1 = clampProgress(-5, 10);
  assert.equal(r1.raw, -5);
  assert.equal(r1.clamped, 0);
  assert.equal(r1.pct, 0);

  const r2 = clampProgress(4, 10);
  assert.equal(r2.clamped, 4);
  assert.equal(r2.pct, 40);

  const r3 = clampProgress(999, 10);
  assert.equal(r3.clamped, 10);
  assert.equal(r3.pct, 100);
});
