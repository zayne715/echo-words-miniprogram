const {
  STORAGE_STUDY,
  STORAGE_REVIEW,
  DEFAULT_STUDY,
  DEFAULT_REVIEW,
  WORD_MIN,
  WORD_MAX,
  clampWord,
} = require("../../utils/studySettings.js");
const { getMeLast7Bars, getMeLifetimeSnapshot } = require("../../utils/appStatsHub.js");
const { getMeProfile, setMeProfileAsync, resetMeProfileToDefault, DEFAULT_NICK } = require("../../utils/meProfileStorage.js");

function formatWithCommas(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
const STEP_HOLD_DELAY_MS = 420;
const STEP_REPEAT_MS = 85;
const STEP_TAP_MAX_MS = 480;

Page({
  data: {
    navTop: 56,
    studySheetOpen: false,
    studySheetEnter: false,
    studyWords: DEFAULT_STUDY,
    reviewWords: DEFAULT_REVIEW,
    weekBars: [],
    lifetimeWordsDisplay: "0",
    lifetimeTimeDisplay: "0 min",
    lifetimeDaysDisplay: "0",
    nickName: DEFAULT_NICK,
    avatarUrl: "",
    showAvatarImg: false,
    profileSheetOpen: false,
    profileSheetEnter: false,
    draftNick: "",
    draftAvatarUrl: "",
  },

  onLoad() {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    this.setData({
      navTop: Math.round(menuBottom + 8),
    });
    this.refreshMeStats();
    this.applyProfileToPage();
  },

  onShow() {
    this.refreshMeStats();
    this.applyProfileToPage();
  },

  applyProfileToPage() {
    const { nickName, avatarUrl } = getMeProfile();
    this.setData({
      nickName,
      avatarUrl,
      showAvatarImg: !!avatarUrl,
    });
  },

  onOpenProfileSheet() {
    if (this.data.studySheetOpen) {
      this.closeStudySettingsSheet();
    }
    const { nickName, avatarUrl } = getMeProfile();
    this.setData({
      profileSheetOpen: true,
      profileSheetEnter: false,
      draftNick: nickName,
      draftAvatarUrl: avatarUrl,
    });
    setTimeout(() => {
      this.setData({ profileSheetEnter: true });
    }, 40);
  },

  closeProfileSheet() {
    if (!this.data.profileSheetOpen) return;
    this.setData({ profileSheetEnter: false });
    setTimeout(() => {
      this.setData({ profileSheetOpen: false });
    }, 320);
  },

  onCloseProfileSheet() {
    this.closeProfileSheet();
  },

  onProfileSheetPanelTap() {},

  onChooseAvatarInSheet(e) {
    const url = e.detail && e.detail.avatarUrl;
    if (url) {
      this.setData({ draftAvatarUrl: url });
    }
  },

  onProfileNickInput(e) {
    this.setData({ draftNick: (e.detail && e.detail.value) || "" });
  },

  onSaveProfileSheet() {
    const nick = String(this.data.draftNick || "").trim();
    const av = String(this.data.draftAvatarUrl || "").trim();
    wx.showLoading({ title: "保存中", mask: true });
    setMeProfileAsync({ nickName: nick || DEFAULT_NICK, avatarUrl: av })
      .then((profile) => {
        wx.hideLoading();
        this.setData({
          nickName: profile.nickName,
          avatarUrl: profile.avatarUrl,
          showAvatarImg: !!profile.avatarUrl,
        });
        wx.showToast({ title: "已保存", icon: "success" });
        this.closeProfileSheet();
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "保存失败", icon: "none" });
      });
  },

  onAvatarImgError() {
    this.setData({ showAvatarImg: false, avatarUrl: "" });
  },

  refreshMeStats() {
    const weekBars = getMeLast7Bars();
    const life = getMeLifetimeSnapshot();
    this.setData({
      weekBars,
      lifetimeWordsDisplay: formatWithCommas(life.totalWords),
      lifetimeTimeDisplay: life.totalHoursLabel || "0 min",
      lifetimeDaysDisplay: String(life.totalDays != null ? life.totalDays : 0),
    });
  },

  onHide() {
    this.clearStepHoldTimers();
  },

  readStoredWords() {
    let studyWords = DEFAULT_STUDY;
    let reviewWords = DEFAULT_REVIEW;
    try {
      const s = wx.getStorageSync(STORAGE_STUDY);
      const r = wx.getStorageSync(STORAGE_REVIEW);
      if (s !== "" && s !== undefined && s !== null && !Number.isNaN(Number(s))) {
        studyWords = clampWord(s, DEFAULT_STUDY);
      }
      if (r !== "" && r !== undefined && r !== null && !Number.isNaN(Number(r))) {
        reviewWords = clampWord(r, DEFAULT_REVIEW);
      }
    } catch (e) {
      /* ignore */
    }
    return { studyWords, reviewWords };
  },

  onOpenStudySettingsSheet() {
    if (this.data.profileSheetOpen) {
      this.closeProfileSheet();
    }
    const { studyWords, reviewWords } = this.readStoredWords();
    this.setData({
      studySheetOpen: true,
      studySheetEnter: false,
      studyWords,
      reviewWords,
    });
    setTimeout(() => {
      this.setData({ studySheetEnter: true });
    }, 40);
  },

  clearStepHoldTimers() {
    if (this._stepHoldDelayTimer) {
      clearTimeout(this._stepHoldDelayTimer);
      this._stepHoldDelayTimer = null;
    }
    if (this._stepHoldRepeatIv) {
      clearInterval(this._stepHoldRepeatIv);
      this._stepHoldRepeatIv = null;
    }
    this._stepHoldRepeating = false;
    this._stepTouchStartAt = 0;
  },

  closeStudySettingsSheet() {
    if (!this.data.studySheetOpen) return;
    this.clearStepHoldTimers();
    this.setData({ studySheetEnter: false });
    setTimeout(() => {
      this.setData({ studySheetOpen: false });
    }, 320);
  },

  onCloseStudySettingsSheet() {
    this.closeStudySettingsSheet();
  },

  onStudySettingsSheetPanelTap() {},

  onDoneStudySettingsSheet() {
    try {
      wx.setStorageSync(STORAGE_STUDY, this.data.studyWords);
      wx.setStorageSync(STORAGE_REVIEW, this.data.reviewWords);
      const { syncActiveFlowSettingsWithStudySettings } = require("../../utils/studyFlowCheckpoint.js");
      syncActiveFlowSettingsWithStudySettings();
    } catch (e) {
      /* ignore */
    }
    this.closeStudySettingsSheet();
  },

  applyStepAction(action) {
    switch (action) {
      case "minusStudy":
        this.setData({ studyWords: Math.max(WORD_MIN, this.data.studyWords - 1) });
        break;
      case "plusStudy":
        this.setData({ studyWords: Math.min(WORD_MAX, this.data.studyWords + 1) });
        break;
      case "minusReview":
        this.setData({ reviewWords: Math.max(WORD_MIN, this.data.reviewWords - 1) });
        break;
      case "plusReview":
        this.setData({ reviewWords: Math.min(WORD_MAX, this.data.reviewWords + 1) });
        break;
      default:
        break;
    }
  },

  onStepTouchStart(e) {
    const { action } = e.currentTarget.dataset;
    if (!action) return;
    this.clearStepHoldTimers();
    this._stepTouchStartAt = Date.now();
    this._stepHoldAction = action;
    this._stepHoldRepeating = false;
    this._stepHoldDelayTimer = setTimeout(() => {
      this._stepHoldRepeating = true;
      this.applyStepAction(action);
      this._stepHoldRepeatIv = setInterval(() => {
        this.applyStepAction(action);
      }, STEP_REPEAT_MS);
    }, STEP_HOLD_DELAY_MS);
  },

  finishStepTouch(isCancel) {
    const action = this._stepHoldAction;
    const wasRepeating = this._stepHoldRepeating;
    const startAt = this._stepTouchStartAt;
    this.clearStepHoldTimers();
    if (!action) return;
    const dt = Date.now() - (startAt || 0);
    if (!wasRepeating && dt < STEP_TAP_MAX_MS && !isCancel) {
      this.applyStepAction(action);
    }
    this._stepHoldAction = null;
  },

  onStepTouchEnd() {
    this.finishStepTouch(false);
  },

  onStepTouchCancel() {
    this.finishStepTouch(true);
  },

  onSignOut() {
    wx.showModal({
      title: "Sign out",
      content:
        "Your nickname and avatar will reset to default. Your learning progress, saved stories, and settings will stay on this device.",
      cancelText: "Cancel",
      confirmText: "Sign Out",
      confirmColor: "#ef4444",
      success: (res) => {
        if (res.confirm) {
          resetMeProfileToDefault();
          this.applyProfileToPage();
          wx.showToast({ title: "Signed out", icon: "none" });
        }
      },
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

  onUnload() {
    this.clearStepHoldTimers();
  },
});
