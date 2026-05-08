const { getStudyWordsPerGroup } = require("./studySettings.js");
const { clampProgress } = require("./progressMath.js");

/**
 * 第二/三轮：进度条宽度与 progress 数值联动；学习页颜色固定为起始蓝色。
 */
function progressBarSnapshot(roundState) {
  const wordLen = roundState.words && roundState.words.length;
  const setting = getStudyWordsPerGroup();
  const total =
    typeof roundState.progressBarTotal === "number" && roundState.progressBarTotal >= 0
      ? roundState.progressBarTotal
      : wordLen || setting;
  const { raw, clamped, pct } = clampProgress(roundState.progress, total);
  const tier = clamped > 0 ? 1 : 0;
  return {
    progressText: `${raw} / ${total}`,
    progressFillWidth: pct,
    progressTier: tier,
  };
}

module.exports = {
  progressBarSnapshot,
};
