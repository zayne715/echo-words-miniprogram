/** 生成完成后临时写入；仅在 Save / Skip 或开始新一轮生成时清除 */
const { warn } = require("./devLogger.js");

const AI_STORY_RESULT_KEY = "aiMemoryStoryResult";
const AI_STORY_GENERATION_STATUS_KEY = "aiMemoryStoryGenerationStatus";

function clearPendingAiStory() {
  try {
    wx.removeStorageSync(AI_STORY_RESULT_KEY);
    wx.removeStorageSync(AI_STORY_GENERATION_STATUS_KEY);
  } catch (e) {
    warn("storyAiStorageKeys", "clearPendingAiStory failed", e);
  }
}

module.exports = {
  AI_STORY_RESULT_KEY,
  AI_STORY_GENERATION_STATUS_KEY,
  clearPendingAiStory,
};
