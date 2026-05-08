const FAB_SIZE = 56;
const FAB_MARGIN = 16;
const { getWordData } = require("../../utils/wordRegistry.js");
const { getGroupsOldestFirst } = require("../../utils/aiReviewGroupsStorage.js");
const { dayKeyFromDate } = require("../../utils/appStatsHub.js");
const {
  AI_STORY_RESULT_KEY,
  AI_STORY_GENERATION_STATUS_KEY,
} = require("../../utils/storyAiStorageKeys.js");
const {
  MONTH_LABELS,
  MAX_STORY_WORDS,
  formatDateLabelFromPick,
  buildCalendarRows,
  buildSelectedSheetListFromGroups,
  showMaxStoryWordsToast,
  filterReviewGroupsForPickedDay,
} = require("../../utils/aiMemoryHelpers.js");

Page({
  data: {
    navTop: 56,
    dateLabel: "Apr 26",
    hasSelection: false,
    selectedCount: 0,
    fabLeft: 0,
    fabTop: 0,
    selectedSheetOpen: false,
    selectedSheetEnter: false,
    selectedSheetList: [],
    primaryButtonLabel: "Select at least 1 word",
    pickedYear: 2026,
    pickedMonth: 4,
    pickedDay: 9,
    calendarOpen: false,
    calendarYear: 2026,
    calendarMonth: 4,
    calendarTitle: "May 2026",
    calendarRows: [],
    memoryGroups: [],
    memoryEmpty: true,
  },

  refreshCalendar() {
    const { calendarYear, calendarMonth, pickedYear, pickedMonth, pickedDay } = this.data;
    const calendarTitle = `${MONTH_LABELS[calendarMonth]} ${calendarYear}`;
    const calendarRows = buildCalendarRows(
      calendarYear,
      calendarMonth,
      pickedYear,
      pickedMonth,
      pickedDay
    );
    this.setData({ calendarTitle, calendarRows });
  },

  onLoad() {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const win = wx.getWindowInfo();
    this._winW = win.windowWidth;
    this._winH = win.windowHeight;
    const fabLeft = win.windowWidth - FAB_MARGIN - FAB_SIZE;
    const fabTop = win.windowHeight - 220;
    this.setData({
      navTop: Math.round(menuBottom + 8),
      pickedYear: y,
      pickedMonth: m,
      pickedDay: d,
      dateLabel: formatDateLabelFromPick(y, m, d),
      calendarYear: y,
      calendarMonth: m,
      fabLeft,
      fabTop,
    });
    this.refreshCalendar();
    this.loadMemoryGroups();
  },

  onShow() {
    if (this.openFinishedStoryIfNeeded()) return;
    this.loadMemoryGroups();
  },

  openFinishedStoryIfNeeded() {
    if (this._openingStoryResult) return true;
    let hasResult = false;
    try {
      const draft = wx.getStorageSync("aiMemoryStorySelection");
      if (!draft || !draft.words || !draft.words.length || !draft.selectedStyle) {
        return false;
      }
      const result = wx.getStorageSync(AI_STORY_RESULT_KEY);
      const status = wx.getStorageSync(AI_STORY_GENERATION_STATUS_KEY);
      hasResult =
        !!(result && result.blocks && result.blocks.length) ||
        !!(status && status.state === "done");
    } catch (e) {
      hasResult = false;
    }
    if (!hasResult) return false;
    this._openingStoryResult = true;
    wx.navigateTo({
      url: "/pages/story-result/index",
      complete: () => {
        setTimeout(() => {
          this._openingStoryResult = false;
        }, 500);
      },
    });
    return true;
  },

  loadMemoryGroups() {
    const prev = this.data.memoryGroups || [];
    const prevSel = {};
    prev.forEach((g) => {
      (g.words || []).forEach((w) => {
        if (w.selected && w.key) prevSel[`${g.id}|${w.key}`] = true;
      });
    });
    const raw = filterReviewGroupsForPickedDay(
      getGroupsOldestFirst(),
      this.data.pickedYear,
      this.data.pickedMonth,
      this.data.pickedDay,
      dayKeyFromDate
    );
    const memoryGroups = raw.map((g, gi) => {
      const id = g.id || `grp_${g.createdAt || gi}`;
      return {
        id,
        title: `Group${gi + 1}`,
        open: gi === 0,
        words: (g.words || []).map((k) => {
          const key = String(k || "").toLowerCase().trim();
          const wd = getWordData(key);
          return {
            key,
            word: wd.word || key,
            pos: wd.pos || "",
            meaning: wd.meaning || "",
            selected: !!prevSel[`${id}|${key}`],
          };
        }),
      };
    });
    this.setData({
      memoryGroups,
      memoryEmpty: memoryGroups.length === 0,
    });
    this.recomputeSelection();
  },

  clampFab(left, top) {
    const w = this._winW || wx.getWindowInfo().windowWidth;
    const h = this._winH || wx.getWindowInfo().windowHeight;
    const navTop = this.data.navTop || 56;
    const edge = 8;
    const maxL = w - FAB_SIZE - edge;
    const maxT = h - FAB_SIZE - edge;
    const minL = edge;
    const minT = navTop + edge;
    return {
      fabLeft: Math.round(Math.min(maxL, Math.max(minL, left))),
      fabTop: Math.round(Math.min(maxT, Math.max(minT, top))),
    };
  },

  openSelectedSheet() {
    if (!this.data.hasSelection) return;
    const selectedSheetList = buildSelectedSheetListFromGroups(this.data.memoryGroups);
    this.setData({
      selectedSheetOpen: true,
      selectedSheetEnter: false,
      selectedSheetList,
    });
    setTimeout(() => {
      this.setData({ selectedSheetEnter: true });
    }, 40);
  },

  closeSelectedSheet() {
    if (!this.data.selectedSheetOpen) return;
    this.setData({ selectedSheetEnter: false });
    setTimeout(() => {
      this.setData({
        selectedSheetOpen: false,
        selectedSheetList: [],
      });
    }, 320);
  },

  onSelectedSheetMaskTap() {
    this.closeSelectedSheet();
  },

  onSelectedSheetPanelTap() {},

  onCloseSelectedSheet() {
    this.closeSelectedSheet();
  },

  onRemoveSelectedChip(e) {
    const gi = Number(e.currentTarget.dataset.gi);
    const wi = Number(e.currentTarget.dataset.wi);
    if (Number.isNaN(gi) || Number.isNaN(wi)) return;
    const groups = this.data.memoryGroups.slice();
    if (!groups[gi] || !groups[gi].words || !groups[gi].words[wi]) return;
    const words = groups[gi].words.slice();
    words[wi] = { ...words[wi], selected: false };
    groups[gi] = { ...groups[gi], words };
    this.setData({ memoryGroups: groups });
    this.recomputeSelection();
  },

  onFabTouchStart(e) {
    if (!this.data.hasSelection) return;
    const t = e.touches[0];
    this._fabTouch = {
      x0: t.clientX,
      y0: t.clientY,
      t0: Date.now(),
      fabL0: this.data.fabLeft,
      fabT0: this.data.fabTop,
    };
    this._fabDrag = false;
    if (this._fabLongTimer) clearTimeout(this._fabLongTimer);
    this._fabLongTimer = setTimeout(() => {
      this._fabDrag = true;
      wx.vibrateShort({ type: "light" });
    }, 450);
  },

  onFabTouchMove(e) {
    if (!this._fabTouch) return;
    const t = e.touches[0];
    const dx = t.clientX - this._fabTouch.x0;
    const dy = t.clientY - this._fabTouch.y0;
    if (!this._fabDrag && this._fabLongTimer) {
      if (Math.hypot(dx, dy) > 12) {
        clearTimeout(this._fabLongTimer);
        this._fabLongTimer = null;
      }
    }
    if (!this._fabDrag) return;
    const nl = this._fabTouch.fabL0 + dx;
    const nt = this._fabTouch.fabT0 + dy;
    this.setData(this.clampFab(nl, nt));
  },

  onFabTouchEnd(e) {
    if (this._fabLongTimer) {
      clearTimeout(this._fabLongTimer);
      this._fabLongTimer = null;
    }
    const touch = e.changedTouches && e.changedTouches[0];
    if (!this._fabTouch || !touch) {
      this._fabDrag = false;
      return;
    }
    const dt = Date.now() - this._fabTouch.t0;
    const dx = touch.clientX - this._fabTouch.x0;
    const dy = touch.clientY - this._fabTouch.y0;
    const dist = Math.hypot(dx, dy);
    const wasDrag = this._fabDrag;
    this._fabDrag = false;
    this._fabTouch = null;

    if (!wasDrag && dt < 400 && dist < 16) {
      this.openSelectedSheet();
      return;
    }
    if (wasDrag && dist <= 20) {
      this.openSelectedSheet();
    }
  },

  onTapDatePill() {
    if (this.data.selectedSheetOpen) {
      this.closeSelectedSheet();
    }
    const { pickedYear, pickedMonth } = this.data;
    this.setData({
      calendarOpen: true,
      calendarYear: pickedYear,
      calendarMonth: pickedMonth,
    });
    this.refreshCalendar();
  },

  onCloseCalendar() {
    this.setData({ calendarOpen: false });
  },

  onCalPanelTap() {},

  onCalendarPrev() {
    let y = this.data.calendarYear;
    let m = this.data.calendarMonth - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    this.setData({ calendarYear: y, calendarMonth: m });
    this.refreshCalendar();
  },

  onCalendarNext() {
    let y = this.data.calendarYear;
    let m = this.data.calendarMonth + 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    this.setData({ calendarYear: y, calendarMonth: m });
    this.refreshCalendar();
  },

  onPickCalendarDay(e) {
    const { day } = e.currentTarget.dataset;
    if (day === undefined || day === "" || day === null) return;
    const d = Number(day);
    if (!d || Number.isNaN(d)) return;
    const y = this.data.calendarYear;
    const m = this.data.calendarMonth;
    this.setData(
      {
        pickedYear: y,
        pickedMonth: m,
        pickedDay: d,
        dateLabel: formatDateLabelFromPick(y, m, d),
        calendarOpen: false,
      },
      () => {
        this.loadMemoryGroups();
      }
    );
  },

  recomputeSelection() {
    const groups = this.data.memoryGroups || [];
    let selectedCount = 0;
    const updated = groups.map((g) => {
      const words = g.words || [];
      words.forEach((w) => {
        if (w.selected) selectedCount += 1;
      });
      const allSelected = words.length > 0 && words.every((w) => w.selected);
      return { ...g, allSelected };
    });
    const hasSelection = selectedCount > 0;
    let primaryButtonLabel = "Select at least 1 word";
    if (selectedCount > 0) {
      primaryButtonLabel =
        selectedCount === 1
          ? "Create Story with 1 word"
          : `Create Story with ${selectedCount} words`;
    }
    this.setData({
      memoryGroups: updated,
      hasSelection,
      selectedCount,
      primaryButtonLabel,
    });

    if (!hasSelection && this.data.selectedSheetOpen) {
      this.closeSelectedSheet();
    } else if (hasSelection && this.data.selectedSheetOpen) {
      this.setData({ selectedSheetList: buildSelectedSheetListFromGroups(updated) });
    }
  },

  onToggleGroup(e) {
    const gi = Number(e.currentTarget.dataset.gi);
    if (Number.isNaN(gi)) return;
    const groups = this.data.memoryGroups.slice();
    if (!groups[gi]) return;
    groups[gi] = { ...groups[gi], open: !groups[gi].open };
    this.setData({ memoryGroups: groups });
  },

  onToggleGroupAll(e) {
    const gi = Number(e.currentTarget.dataset.gi);
    if (Number.isNaN(gi)) return;
    const groups = this.data.memoryGroups.slice();
    const g = groups[gi];
    if (!g || !g.words || !g.words.length) return;
    const next = !g.allSelected;
    if (next) {
      let other = 0;
      groups.forEach((gg, idx) => {
        if (idx === gi) return;
        (gg.words || []).forEach((w) => {
          if (w.selected) other += 1;
        });
      });
      if (other + g.words.length > MAX_STORY_WORDS) {
        showMaxStoryWordsToast();
        return;
      }
    }
    const words = g.words.map((w) => ({
      ...w,
      selected: next,
    }));
    groups[gi] = { ...g, words, allSelected: next };
    this.setData({ memoryGroups: groups });
    this.recomputeSelection();
  },

  onToggleWord(e) {
    const gi = Number(e.currentTarget.dataset.gi);
    const wi = Number(e.currentTarget.dataset.wi);
    if (Number.isNaN(gi) || Number.isNaN(wi)) return;
    const groups = this.data.memoryGroups.slice();
    const g = groups[gi];
    if (!g || !g.words || !g.words[wi]) return;
    const words = g.words.slice();
    const nextSel = !words[wi].selected;
    if (nextSel) {
      let count = 0;
      groups.forEach((gg) => {
        (gg.words || []).forEach((w) => {
          if (w.selected) count += 1;
        });
      });
      if (count >= MAX_STORY_WORDS) {
        showMaxStoryWordsToast();
        return;
      }
    }
    words[wi] = { ...words[wi], selected: nextSel };
    groups[gi] = { ...g, words };
    this.setData({ memoryGroups: groups });
    this.recomputeSelection();
  },

  onTapMySaves() {
    wx.navigateTo({
      url: "/pages/my-saves/index",
    });
  },

  onTapPrimary() {
    if (!this.data.hasSelection) return;
    const words = [];
    (this.data.memoryGroups || []).forEach((g) => {
      (g.words || []).forEach((w) => {
        if (w.selected) words.push(w.word);
      });
    });
    if (words.length > MAX_STORY_WORDS) {
      showMaxStoryWordsToast();
      return;
    }
    wx.setStorageSync("aiMemoryStorySelection", {
      words,
      ts: Date.now(),
    });
    wx.navigateTo({
      url: "/pages/story-style/index",
    });
  },

  onTabWords() {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },

  onTabMe() {
    wx.reLaunch({
      url: "/pages/me/index",
    });
  },
});
