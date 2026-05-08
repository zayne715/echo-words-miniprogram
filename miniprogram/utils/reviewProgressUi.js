const { clampProgress } = require("./progressMath.js");

/** Review 模式：绿色进度条，分母为词表长度 */
function reviewProgressSnapshot(state) {
  const total =
    typeof state.totalWordCount === "number"
      ? state.totalWordCount
      : (state.words && state.words.length) || 4;
  const { raw, pct } = clampProgress(state.progress, total);
  return {
    progressText: `${raw} / ${total}`,
    progressFillWidth: pct,
  };
}

module.exports = {
  reviewProgressSnapshot,
};
