const {
  getLearningSessionKeysSnapshot,
} = require("./wordRegistry.js");
const { getStudyWordsPerGroup } = require("./studySettings.js");

/**
 * 第一轮学习顶部进度：固定为 0 / n（n 为本组词数），条不增长；第二轮起再用 recall 规则。
 */
function learningRound1Progress() {
  const keys = getLearningSessionKeysSnapshot();
  const setting = getStudyWordsPerGroup();
  const total = Math.max(1, keys.length || setting);

  return {
    progressLabel: `0 / ${total}`,
    progressFillWidth: 0,
  };
}

module.exports = {
  learningRound1Progress,
};
