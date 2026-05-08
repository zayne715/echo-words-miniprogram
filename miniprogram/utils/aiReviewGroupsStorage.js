/**
 * AI Memory：用户完整复习完一组后追加的 Group1、Group2…
 */
const { warn } = require("./devLogger.js");

const STORAGE_KEY = "AI_MEMORY_REVIEW_GROUPS_V1";

function loadList() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (Array.isArray(raw)) return raw;
  } catch (e) {
    warn("aiReviewGroupsStorage", "loadList failed", e);
  }
  return [];
}

function saveList(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list.slice(0, 200));
  } catch (e) {
    warn("aiReviewGroupsStorage", "saveList failed", e);
  }
}

function appendReviewGroup(wordKeys) {
  const keys = (wordKeys || [])
    .map((x) => String(x || "").toLowerCase().trim())
    .filter(Boolean);
  if (!keys.length) return null;
  const list = loadList();
  const n = list.length + 1;
  const item = {
    id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: `Group${n}`,
    words: keys,
    createdAt: Date.now(),
  };
  list.push(item);
  saveList(list);
  return item;
}

/** 按完成顺序：Group1 在前，新组在后 */
function getGroupsOldestFirst() {
  return loadList();
}

module.exports = {
  appendReviewGroup,
  getGroupsOldestFirst,
};
