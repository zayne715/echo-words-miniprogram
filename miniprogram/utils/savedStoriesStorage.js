/**
 * My Saves：仅当用户在故事结果页点击 Save 后写入；默认不注入任何本地数据。
 */
const STORAGE_KEY = "ai_memory_saved_stories";
const MAX_ITEMS = 200;

function normalizeList(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x.id === "string");
}

function getSavedStories() {
  try {
    return normalizeList(wx.getStorageSync(STORAGE_KEY));
  } catch (e) {
    return [];
  }
}

function persist(list) {
  wx.setStorageSync(STORAGE_KEY, list.slice(0, MAX_ITEMS));
}

/**
 * @param {object} entry
 * @param {string} [entry.genreKey] cultivation | urban | survival | epic | heartbeat | scifi | romance | mystery | daily
 * @param {string} [entry.genreLabel] 展示用，缺省可按 genreKey 推导
 */
function addSavedStory(entry) {
  const list = getSavedStories();
  const item = {
    id: entry.id || `story_${Date.now()}`,
    title: entry.title || "Untitled story",
    preview: entry.preview || "",
    body: entry.body || "",
    bodyZh: entry.bodyZh || "",
    words: Array.isArray(entry.words) ? entry.words : [],
    savedAt: typeof entry.savedAt === "number" ? entry.savedAt : Date.now(),
    genreKey: entry.genreKey || "urban",
    genreLabel: entry.genreLabel || "",
  };
  if (Array.isArray(entry.bodyBlocks) && entry.bodyBlocks.length > 0) {
    item.bodyBlocks = entry.bodyBlocks;
  }
  const next = [item, ...list.filter((s) => s.id !== item.id)];
  persist(next);
  return item;
}

function removeSavedStory(id) {
  const list = getSavedStories().filter((s) => s.id !== id);
  persist(list);
}

module.exports = {
  STORAGE_KEY,
  getSavedStories,
  addSavedStory,
  removeSavedStory,
};
