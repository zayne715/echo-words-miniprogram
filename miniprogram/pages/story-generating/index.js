const STORAGE_KEY = "aiMemoryStorySelection";
const RESULT_PATH = "/pages/story-result/index";
const { buildSystemPrompt, buildUserContent } = require("../../utils/storyAiPrompt.js");
const { GENRE_LABEL } = require("../../utils/storyContent.js");
const {
  AI_STORY_RESULT_KEY,
  AI_STORY_GENERATION_STATUS_KEY,
} = require("../../utils/storyAiStorageKeys.js");

let activeGeneration = null;

function generationIdFromDraft(draft) {
  const words = ((draft && draft.words) || []).map((w) => String(w || "").toLowerCase()).join("|");
  return `${draft && draft.selectedStyle ? draft.selectedStyle : ""}:${words}`;
}

function markGenerationStatus(state, generationId, extra) {
  try {
    wx.setStorageSync(AI_STORY_GENERATION_STATUS_KEY, {
      state,
      generationId,
      ts: Date.now(),
      ...(extra || {}),
    });
  } catch (e) {}
}

function openResultIfAiMemoryVisible() {
  try {
    const pages = getCurrentPages();
    const top = pages[pages.length - 1];
    if (!top || top.route !== "pages/ai-memory/index") return;
    wx.navigateTo({ url: RESULT_PATH });
  } catch (e) {}
}

Page({
  data: {
    navTop: 56,
  },

  onLoad() {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    this.setData({ navTop: Math.round(menuBottom + 8) });

    const draft = wx.getStorageSync(STORAGE_KEY);
    if (!draft || !draft.words || !draft.words.length || !draft.selectedStyle) {
      this._invalid = true;
      wx.reLaunch({ url: "/pages/ai-memory/index" });
      return;
    }
    this._active = true;
    this._generationId = generationIdFromDraft(draft);
    const existingResult = wx.getStorageSync(AI_STORY_RESULT_KEY);
    const status = wx.getStorageSync(AI_STORY_GENERATION_STATUS_KEY);
    const sameGen =
      status && status.generationId === this._generationId && status.state === "done";
    if (sameGen && (existingResult || status.fallback)) {
      this._invalid = true;
      wx.redirectTo({ url: RESULT_PATH });
    }
  },

  onReady() {
    if (this._invalid) return;
    this.runGeneration();
  },

  onUnload() {
    this._active = false;
  },

  /** 返回风格选择页；生成在后台继续，完成后仍可在 AI Memory 看到结果页 */
  onBack() {
    this._active = false;
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({ url: "/pages/story-style/index" });
  },

  runGeneration() {
    const draft = wx.getStorageSync(STORAGE_KEY);
    const generationId = generationIdFromDraft(draft);
    if (
      activeGeneration &&
      activeGeneration.generationId === generationId &&
      activeGeneration.promise
    ) {
      activeGeneration.promise.then(() => {
        if (this._active) wx.redirectTo({ url: RESULT_PATH });
      });
      return;
    }

    if (!wx.cloud) {
      wx.showToast({
        title: "请开启云开发并初始化 wx.cloud",
        icon: "none",
      });
      markGenerationStatus("done", generationId, { fallback: true });
      setTimeout(() => {
        if (this._active) wx.redirectTo({ url: RESULT_PATH });
      }, 1500);
      return;
    }

    markGenerationStatus("pending", generationId);
    const promise = wx.cloud
      .callFunction({
        name: "deepseekStory",
        /** 默认约 3s 会超时（-504003）；DeepSeek 常需数秒～数十秒，最长可设 60000ms */
        timeout: 60000,
        data: {
          systemPrompt: buildSystemPrompt(draft.selectedStyle),
          userContent: buildUserContent(draft.words, draft.selectedStyle),
          genreKey: draft.selectedStyle,
          genreLabel: GENRE_LABEL[draft.selectedStyle] || "",
        },
      })
      .then((res) => {
        const r = res.result;
        if (r && r.ok && r.story && r.story.blocks && r.story.blocks.length) {
          wx.setStorageSync(AI_STORY_RESULT_KEY, r.story);
          markGenerationStatus("done", generationId);
          if (this._active) wx.redirectTo({ url: RESULT_PATH });
          else openResultIfAiMemoryVisible();
          return true;
        }
        const rawMsg = (r && r.errMsg) || "生成失败";
        wx.showToast({
          title: rawMsg.length > 18 ? "生成失败，已用本地示例" : rawMsg,
          icon: "none",
        });
        markGenerationStatus("done", generationId, { fallback: true });
        setTimeout(() => {
          if (this._active) wx.redirectTo({ url: RESULT_PATH });
          else openResultIfAiMemoryVisible();
        }, 1600);
        return false;
      })
      .catch((err) => {
        console.error("[deepseekStory] callFunction fail:", err);
        const detail =
          (err && err.errMsg) ||
          (typeof err === "string" ? err : "") ||
          "云函数调用失败";
        markGenerationStatus("done", generationId, { fallback: true, errMsg: detail });
        if (!this._active) {
          openResultIfAiMemoryVisible();
          return false;
        }
        wx.showModal({
          title: "云函数未就绪",
          content:
            `${detail}\n\n常见原因：未上传云函数、环境与 app.js 中 CLOUD_ENV_ID 不一致、未开通云开发。\n点下方按钮先看本地示例故事。`,
          showCancel: false,
          confirmText: "看示例故事",
          success: (r) => {
            if (r.confirm && this._active) {
              wx.redirectTo({ url: RESULT_PATH });
            }
          },
        });
        return false;
      })
      .finally(() => {
        if (activeGeneration && activeGeneration.generationId === generationId) {
          activeGeneration = null;
        }
      });

    activeGeneration = { generationId, promise };
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
