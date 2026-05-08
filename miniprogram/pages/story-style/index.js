const STORAGE_KEY = "aiMemoryStorySelection";
const { clearPendingAiStory } = require("../../utils/storyAiStorageKeys.js");

function reportStoryGenerateTap() {
  if (typeof wx.reportEvent !== "function") return;
  wx.reportEvent("tap_story_generate", {});
}

/** 各风格独立事件，免费版 We 分析可直接看各事件总次数，无需分组会员 */
const STYLE_EVENT_BY_ID = {
  cultivation: "tap_story_style_cultivation",
  urban: "tap_story_style_urban",
  survival: "tap_story_style_survival",
  epic: "tap_story_style_epic",
  heartbeat: "tap_story_style_heartbeat",
};

function reportStoryStyleCardTap(styleId) {
  if (typeof wx.reportEvent !== "function") return;
  const eventId = STYLE_EVENT_BY_ID[styleId];
  if (!eventId) return;
  wx.reportEvent(eventId, {});
}

/** 配色与图标对齐 Figma 234:576 */
const STYLES = [
  {
    id: "cultivation",
    label: "Cultivation",
    bg: "#ecfdf5",
    color: "#10b981",
    icon: "/images/figma/story-style/icon-cultivation.svg",
  },
  {
    id: "urban",
    label: "Urban Powers",
    bg: "#eef2ff",
    color: "#6366f1",
    icon: "/images/figma/story-style/icon-urban.svg",
  },
  {
    id: "survival",
    label: "Doomsday Survival",
    bg: "#fef3c7",
    color: "#d97706",
    icon: "/images/figma/story-style/icon-survival.svg",
  },
  {
    id: "epic",
    label: "Epic Court",
    bg: "#f3e8ff",
    color: "#9333ea",
    icon: "/images/figma/story-style/icon-epic.svg",
  },
  {
    id: "heartbeat",
    label: "Sweet Romantic",
    bg: "#fdf2f8",
    color: "#ec4899",
    icon: "/images/figma/story-style/icon-heartbeat.svg",
  },
];

Page({
  data: {
    navTop: 56,
    words: [],
    selectedSummary: "",
    selectedStyle: "",
    styles: STYLES,
    canGenerate: false,
  },

  onLoad() {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    const draft = wx.getStorageSync(STORAGE_KEY);
    if (!draft || !draft.words || !draft.words.length) {
      wx.navigateBack();
      return;
    }
    const words = draft.words;
    const n = words.length;
    const selectedSummary = `${n} word${n === 1 ? "" : "s"} selected`;
    this.setData({
      navTop: Math.round(menuBottom + 8),
      words,
      selectedSummary,
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onSelectStyle(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    reportStoryStyleCardTap(id);
    const next = id === this.data.selectedStyle ? "" : id;
    this.setData({
      selectedStyle: next,
      canGenerate: !!next,
    });
  },

  onGenerate() {
    if (!this.data.canGenerate || !this.data.selectedStyle) {
      wx.showToast({
        title: "Choose a story style first",
        icon: "none",
      });
      return;
    }
    const draft = wx.getStorageSync(STORAGE_KEY);
    if (!draft || !draft.words || !draft.words.length) {
      wx.showToast({
        title: "No words selected",
        icon: "none",
      });
      return;
    }
    reportStoryGenerateTap();
    clearPendingAiStory();
    wx.setStorageSync(STORAGE_KEY, {
      words: draft.words,
      selectedStyle: this.data.selectedStyle,
      ts: Date.now(),
    });
    wx.navigateTo({
      url: "/pages/story-generating/index",
    });
  },

  onTabWords() {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },

  onTabAiMemory() {
    wx.reLaunch({
      url: "/pages/ai-memory/index",
    });
  },

  onTabMe() {
    wx.reLaunch({
      url: "/pages/me/index",
    });
  },
});
