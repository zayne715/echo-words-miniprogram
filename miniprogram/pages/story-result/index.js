const STORAGE_KEY = "aiMemoryStorySelection";
const { buildStoryFromWords, GENRE_LABEL } = require("../../utils/storyContent.js");
const { addSavedStory } = require("../../utils/savedStoriesStorage.js");
const {
  AI_STORY_RESULT_KEY,
  clearPendingAiStory,
} = require("../../utils/storyAiStorageKeys.js");
const { sanitizeStoryBlocks } = require("../../utils/storyZhSanitize.js");

function reportStorySaveTap() {
  if (typeof wx.reportEvent !== "function") return;
  wx.reportEvent("tap_story_save", {});
}

function reportStorySkipTap() {
  if (typeof wx.reportEvent !== "function") return;
  wx.reportEvent("tap_story_skip", {});
}

Page({
  data: {
    navTop: 56,
    title: "",
    metaLine: "",
    blocks: [],
    words: [],
    storyId: "",
  },

  onLoad() {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    const draft = wx.getStorageSync(STORAGE_KEY);
    if (!draft || !draft.words || !draft.words.length || !draft.selectedStyle) {
      wx.reLaunch({ url: "/pages/ai-memory/index" });
      return;
    }

    const aiStory = wx.getStorageSync(AI_STORY_RESULT_KEY);
    let built;
    if (aiStory && aiStory.blocks && aiStory.blocks.length) {
      const gl = GENRE_LABEL[draft.selectedStyle] || aiStory.genreLabel || "";
      built = {
        title: aiStory.title || "Story",
        metaLine:
          aiStory.metaLine ||
          `${gl} · Generated just now`,
        blocks: aiStory.blocks,
        plainEn: aiStory.plainEn || "",
        plainZh: aiStory.plainZh || "",
        genreKey: draft.selectedStyle,
        genreLabel: gl,
      };
    } else {
      built = buildStoryFromWords(draft.words, draft.selectedStyle);
    }

    built = {
      ...built,
      blocks: sanitizeStoryBlocks(built.blocks),
    };
    built.plainZh = (built.blocks || []).map((b) => b.zh || "").filter(Boolean).join("\n\n");

    this._built = built;
    const storyId = `story_${Date.now()}`;
    this.setData({
      navTop: Math.round(menuBottom + 8),
      title: built.title,
      metaLine: built.metaLine,
      blocks: built.blocks,
      words: draft.words,
      storyId,
    });
  },

  /** 回到风格选择页；不清除已生成故事，切 Tab 再回 AI Memory 仍会进入结果页，直到 Save / Skip */
  onBack() {
    wx.redirectTo({ url: "/pages/story-style/index" });
  },

  onSave() {
    const built = this._built;
    if (!built) return;
    reportStorySaveTap();
    clearPendingAiStory();
    addSavedStory({
      id: this.data.storyId,
      title: built.title,
      preview: (built.plainEn || "").slice(0, 200),
      body: built.plainEn || "",
      bodyZh: built.plainZh || "",
      words: this.data.words,
      genreKey: built.genreKey,
      genreLabel: built.genreLabel,
    });
    wx.showToast({ title: "Saved", icon: "success" });
    setTimeout(() => {
      wx.reLaunch({ url: "/pages/my-saves/index" });
    }, 450);
  },

  onSkip() {
    reportStorySkipTap();
    clearPendingAiStory();
    // 略延迟跳转，避免 reLaunch 过快导致 wx.reportEvent 来不及上报
    setTimeout(() => {
      wx.reLaunch({ url: "/pages/ai-memory/index" });
    }, 450);
  },

  onTabWords() {
    wx.reLaunch({ url: "/pages/index/index" });
  },

  onTabAiMemory() {
    wx.reLaunch({ url: "/pages/ai-memory/index" });
  },

  onTabMe() {
    wx.reLaunch({ url: "/pages/me/index" });
  },
});
