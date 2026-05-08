const {
  getSavedStories,
  removeSavedStory,
} = require("../../utils/savedStoriesStorage.js");
const { sanitizeStoryBlocks } = require("../../utils/storyZhSanitize.js");

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateShort(ts) {
  const d = new Date(ts);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function previewText(text, maxLen) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

function normalizeGenreKey(raw) {
  const k = (raw || "").toLowerCase();
  if (["cultivation", "urban", "survival", "epic", "heartbeat"].includes(k)) return k;
  if (["scifi", "sci-fi", "sci_fi"].includes(k)) return "scifi";
  if (k === "romance") return "romance";
  if (k === "mystery") return "mystery";
  if (k === "daily") return "daily";
  return "urban";
}

function defaultGenreLabel(key) {
  if (key === "cultivation") return "Cultivation";
  if (key === "urban") return "Urban Powers";
  if (key === "survival") return "Doomsday Survival";
  if (key === "epic") return "Epic Court";
  if (key === "heartbeat") return "Sweet Romantic";
  if (key === "scifi") return "Sci-Fi";
  if (key === "romance") return "Romance";
  if (key === "mystery") return "Mystery";
  if (key === "daily") return "Daily";
  return "Urban Powers";
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeAdjacentSegments(segments) {
  const out = [];
  (segments || []).forEach((seg) => {
    if (!seg || seg.text === undefined || seg.text === null) return;
    const chunk = String(seg.text);
    if (!chunk) return;
    const prev = out[out.length - 1];
    if (prev && prev.highlight === !!seg.highlight) {
      prev.text += chunk;
    } else {
      out.push({ text: chunk, highlight: !!seg.highlight });
    }
  });
  return out.length ? out : [{ text: "", highlight: false }];
}

/** 对选词 vocabulary 做稿内紫色标记（Figma 63:1059） */
function segmentize(text, words) {
  const t = text || "";
  const list = [
    ...new Set(
      (words || [])
        .map((w) => String(w).trim())
        .filter((w) => w.length >= 2)
    ),
  ];
  if (!t || !list.length) {
    return mergeAdjacentSegments([{ text: t, highlight: false }]);
  }
  list.sort((a, b) => b.length - a.length);
  try {
    const patternParts = list.map((w) => {
      if (/^[a-zA-Z][a-zA-Z'-]*$/.test(w)) {
        return `\\b${escapeRegExp(w)}\\b`;
      }
      return escapeRegExp(w);
    });
    const re = new RegExp(`(${patternParts.join("|")})`, "gi");
    const rawSegs = [];
    let last = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (m.index > last) {
        rawSegs.push({ text: t.slice(last, m.index), highlight: false });
      }
      rawSegs.push({ text: m[0], highlight: true });
      last = m.index + m[0].length;
    }
    if (last < t.length) {
      rawSegs.push({ text: t.slice(last), highlight: false });
    }
    return mergeAdjacentSegments(rawSegs.length ? rawSegs : [{ text: t, highlight: false }]);
  } catch (e) {
    return mergeAdjacentSegments([{ text: t, highlight: false }]);
  }
}

function countChineseChars(s) {
  return (s.match(/[\u4e00-\u9fff]/g) || []).length;
}

function countLatinLetters(s) {
  return (s.match(/[a-zA-Z]/g) || []).length;
}

/** 判定是否为中文翻译段：汉字多于拉丁字母即可（避免「至少 4 个汉字」误杀短句） */
function isMostlyChinese(s) {
  if (!s) return false;
  const cn = countChineseChars(s);
  if (cn === 0) return false;
  const lat = countLatinLetters(s);
  return cn >= lat;
}

function splitBodyParagraphs(body) {
  const normalized = String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  let paras = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 2) return paras;
  const single = normalized.split(/\n/).map((p) => p.trim()).filter(Boolean);
  if (single.length >= 2) return single;
  return paras.length ? paras : single;
}

/** 「前面全是英文段、后面全是中文段」→ 按序号 zip 成 [英1+译1][英2+译2]…（阅读顺序与交替排版一致） */
function zipEnglishHeadChineseTail(paras, words) {
  const firstZhIdx = paras.findIndex(isMostlyChinese);
  if (firstZhIdx <= 0) return null;
  const head = paras.slice(0, firstZhIdx);
  const tail = paras.slice(firstZhIdx);
  if (!head.every((p) => !isMostlyChinese(p))) return null;
  if (!tail.every(isMostlyChinese)) return null;
  const n = Math.min(head.length, tail.length);
  const blocks = [];
  for (let i = 0; i < n; i++) {
    blocks.push({
      segments: segmentize(head[i], words),
      zh: tail[i],
    });
  }
  for (let i = n; i < head.length; i++) {
    blocks.push({ segments: segmentize(head[i], words), zh: "" });
  }
  for (let i = n; i < tail.length; i++) {
    blocks.push({
      segments: [{ text: "", highlight: false }],
      zh: tail[i],
    });
  }
  return blocks;
}

/** 「一段英文紧接着一段翻译」交替排列 EN,ZH,EN,ZH… */
function pairAlternatingEnglishChinese(paras, words) {
  const blocks = [];
  let i = 0;
  while (i < paras.length) {
    const p = paras[i];
    if (isMostlyChinese(p)) {
      blocks.push({ segments: [{ text: "", highlight: false }], zh: p });
      i += 1;
      continue;
    }
    let zh = "";
    if (i + 1 < paras.length && isMostlyChinese(paras[i + 1])) {
      zh = paras[i + 1];
      i += 2;
    } else {
      i += 1;
    }
    blocks.push({ segments: segmentize(p, words), zh });
  }
  return blocks;
}

/** `body` 只存英文、`bodyZh` 只存译文（同序多段），展示时一段英文一段翻译交错 */
function zipBodyAndBodyZhFields(raw, words) {
  const body = (raw.body || "").trim();
  const bodyZh = (raw.bodyZh || "").trim();
  if (!body || !bodyZh) return null;
  const enParas = splitBodyParagraphs(body);
  const zhParas = splitBodyParagraphs(bodyZh);
  if (!enParas.length || !zhParas.length) return null;
  if (!enParas.every((p) => !isMostlyChinese(p))) return null;
  if (!zhParas.every(isMostlyChinese)) return null;
  const n = Math.min(enParas.length, zhParas.length);
  const blocks = [];
  for (let i = 0; i < n; i++) {
    blocks.push({
      segments: segmentize(enParas[i], words),
      zh: zhParas[i],
    });
  }
  for (let i = n; i < enParas.length; i++) {
    blocks.push({ segments: segmentize(enParas[i], words), zh: "" });
  }
  for (let i = n; i < zhParas.length; i++) {
    blocks.push({
      segments: [{ text: "", highlight: false }],
      zh: zhParas[i],
    });
  }
  return blocks.length ? blocks : null;
}

/** body 内：优先 EN 全文+ZH 全文 zip；否则交替 EN,ZH,EN,ZH… */
function legacyBlocksFromBody(body, words, previewFallback, bodyZhExtra) {
  const raw = (body || "").trim();
  const zhExtra = (bodyZhExtra || "").trim();
  if (!raw && zhExtra) {
    const zhParas = splitBodyParagraphs(zhExtra);
    return zhParas.map((zh) => ({
      segments: [{ text: "", highlight: false }],
      zh,
    }));
  }
  if (!raw) {
    const fb = (previewFallback || "").trim();
    if (!fb) {
      return [{ segments: [{ text: "No story content yet.", highlight: false }], zh: "" }];
    }
    return [{ segments: segmentize(fb, words), zh: "" }];
  }
  const paras = splitBodyParagraphs(raw);
  let zipBlocks = zipEnglishHeadChineseTail(paras, words);
  if (zipBlocks && zipBlocks.length > 0) {
    return zipBlocks;
  }
  const altBlocks = pairAlternatingEnglishChinese(paras, words);
  return altBlocks.length ? altBlocks : [{ segments: segmentize(raw, words), zh: "" }];
}

/** Figma 63:951 — 翻译 + 选词高亮 blocks */
function annotateBlocks(blocks) {
  return (blocks || []).map((b) => ({
    ...b,
    hasEnglish: (b.segments || []).some((s) => s.text && String(s.text).trim()),
  }));
}

function buildDetailBlocks(raw) {
  const words = raw.words || [];
  if (Array.isArray(raw.bodyBlocks) && raw.bodyBlocks.length > 0) {
    return raw.bodyBlocks.map((b) => {
      if (Array.isArray(b.segments) && b.segments.length > 0) {
        return {
          segments: mergeAdjacentSegments(
            b.segments.map((s) => ({
              text: s.text != null ? String(s.text) : "",
              highlight: !!s.highlight,
            }))
          ),
          zh: b.zh != null ? String(b.zh) : "",
        };
      }
      const en = b.en || b.enText || "";
      return {
        segments: segmentize(en, words),
        zh: b.zh || "",
      };
    });
  }
  const zippedFields = zipBodyAndBodyZhFields(raw, words);
  if (zippedFields && zippedFields.length > 0) {
    return zippedFields;
  }
  return legacyBlocksFromBody(raw.body, words, raw.preview, raw.bodyZh);
}

function buildDetailForView(raw) {
  return annotateBlocks(sanitizeStoryBlocks(buildDetailBlocks(raw)));
}

function mapStoryRows(list, selectionIds) {
  const useSel = selectionIds !== undefined && selectionIds !== null;
  return list.map((s) => {
    const words = s.words || [];
    const n = words.length;
    const genreKey = normalizeGenreKey(s.genreKey);
    const genreLabel = s.genreLabel || defaultGenreLabel(genreKey);
    const previewRaw = s.preview || previewText(s.body, 220);
    const row = {
      ...s,
      genreKey,
      genreLabel,
      dateShort: formatDateShort(s.savedAt || Date.now()),
      wordCountLabel: n === 1 ? "1 word" : `${n} words`,
      preview: previewRaw,
    };
    if (useSel) {
      row.selected = !!selectionIds[s.id];
    }
    return row;
  });
}

Page({
  data: {
    navTop: 56,
    stories: [],
    empty: true,
    selectionMode: false,
    selectAll: false,
    selectedIds: {},
    detailSheetOpen: false,
    sheetPanelEnter: false,
    detail: null,
    deleteDialogOpen: false,
    deleteDialogEnter: false,
    deleteDialogMessage: "",
    pendingDeleteIds: [],
  },

  onLoad() {
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const menuBottom = menuButton.bottom || menuButton.top + menuButton.height;
    this.setData({
      navTop: Math.round(menuBottom + 3),
    });
  },

  onShow() {
    this.reloadStories();
  },

  reloadStories() {
    const stored = getSavedStories();
    const sorted = stored.slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const sel = this.data.selectionMode ? this.data.selectedIds : undefined;
    const stories = mapStoryRows(sorted, sel);
    const ids = sorted.map((s) => s.id);
    const allOn =
      this.data.selectionMode &&
      ids.length > 0 &&
      ids.every((id) => this.data.selectedIds[id]);
    this.setData({
      stories,
      empty: stories.length === 0,
      selectAll: allOn,
    });
  },

  onBack() {
    if (this.data.deleteDialogOpen) {
      this.onDeleteDialogCancel();
      return;
    }
    if (this.data.detailSheetOpen) {
      this.closeStoryDetail();
      return;
    }
    if (this.data.selectionMode) {
      this.setData({
        selectionMode: false,
        selectedIds: {},
        selectAll: false,
      });
      this.reloadStories();
      return;
    }
    if (getCurrentPages().length <= 1) {
      wx.reLaunch({ url: "/pages/ai-memory/index" });
      return;
    }
    wx.navigateBack({ delta: 1 });
  },

  openStoryDetail(id) {
    const raw = getSavedStories().find((x) => x.id === id);
    if (!raw) return;
    const genreKey = normalizeGenreKey(raw.genreKey);
    const genreLabel = raw.genreLabel || defaultGenreLabel(genreKey);
    this.setData({
      detailSheetOpen: true,
      sheetPanelEnter: false,
      detail: {
        id: raw.id,
        title: raw.title || "Untitled story",
        dateShort: formatDateShort(raw.savedAt || Date.now()),
        genreKey,
        genreLabel,
        bodyBlocks: buildDetailForView(raw),
      },
    });
    setTimeout(() => {
      this.setData({ sheetPanelEnter: true });
    }, 40);
  },

  closeStoryDetail() {
    if (!this.data.detailSheetOpen) return;
    this.setData({ sheetPanelEnter: false });
    setTimeout(() => {
      this.setData({
        detailSheetOpen: false,
        detail: null,
      });
    }, 320);
  },

  onSheetMaskTap() {
    this.closeStoryDetail();
  },

  onSheetPanelTap() {},

  onCloseDetailSheet() {
    this.closeStoryDetail();
  },

  onStoryCardTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    if (this.data.selectionMode) {
      const next = { ...this.data.selectedIds };
      if (next[id]) delete next[id];
      else next[id] = true;
      const stored = getSavedStories().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      const sid = stored.map((s) => s.id);
      this.setData({
        selectedIds: next,
        selectAll: sid.length > 0 && sid.every((i) => next[i]),
        stories: mapStoryRows(stored, next),
      });
      return;
    }
    this.openStoryDetail(id);
  },

  onTapHeaderExtra() {
    if (!this.data.selectionMode) {
      this.setData({
        selectionMode: true,
        selectedIds: {},
        selectAll: false,
      });
      this.reloadStories();
      return;
    }
    this.confirmDeleteSelected();
  },

  onToggleSelectAll() {
    const stored = getSavedStories().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const ids = stored.map((s) => s.id);
    const allOn = ids.length > 0 && ids.every((id) => this.data.selectedIds[id]);
    const next = {};
    if (!allOn) {
      ids.forEach((id) => {
        next[id] = true;
      });
    }
    this.setData({
      selectedIds: next,
      selectAll: ids.length > 0 && ids.every((id) => next[id]),
      stories: mapStoryRows(stored, next),
    });
  },

  onToggleStory(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const next = { ...this.data.selectedIds };
    if (next[id]) delete next[id];
    else next[id] = true;
    const stored = getSavedStories().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const ids = stored.map((s) => s.id);
    this.setData({
      selectedIds: next,
      selectAll: ids.length > 0 && ids.every((i) => next[i]),
      stories: mapStoryRows(stored, next),
    });
  },

  confirmDeleteSelected() {
    const ids = Object.keys(this.data.selectedIds).filter((k) => this.data.selectedIds[k]);
    if (!ids.length) {
      wx.showToast({
        title: "Select stories to delete",
        icon: "none",
      });
      return;
    }
    const n = ids.length;
    const deleteDialogMessage =
      n === 1
        ? "This cannot be undone."
        : `${n} stories will be deleted. This cannot be undone.`;
    this.setData({
      deleteDialogOpen: true,
      deleteDialogEnter: false,
      deleteDialogMessage,
      pendingDeleteIds: ids,
    });
    wx.nextTick(() => {
      setTimeout(() => this.setData({ deleteDialogEnter: true }), 24);
    });
  },

  onDeleteDialogCancel() {
    if (!this.data.deleteDialogOpen) return;
    this.setData({ deleteDialogEnter: false });
    setTimeout(() => {
      this.setData({
        deleteDialogOpen: false,
        pendingDeleteIds: [],
      });
    }, 220);
  },

  onDeleteDialogConfirm() {
    const ids = (this.data.pendingDeleteIds || []).slice();
    if (!ids.length) return;
    this.setData({ deleteDialogEnter: false });
    setTimeout(() => {
      ids.forEach((id) => removeSavedStory(id));
      this.setData({
        deleteDialogOpen: false,
        pendingDeleteIds: [],
        selectionMode: false,
        selectedIds: {},
        selectAll: false,
      });
      this.reloadStories();
    }, 220);
  },

  onTabWords() {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },

  onTabAiMemory() {
    wx.redirectTo({
      url: "/pages/ai-memory/index",
    });
  },

  onTabMe() {
    wx.reLaunch({
      url: "/pages/me/index",
    });
  },
});
