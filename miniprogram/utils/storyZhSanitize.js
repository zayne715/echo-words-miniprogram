/** 清洗 AI 中文译文里误输出的英文字母/单词 */
function sanitizeZhParagraph(zh) {
  let s = String(zh || "").trim();
  if (!s) return s;
  s = s.replace(/[a-zA-Z][a-zA-Z0-9'’\-]*/g, "");
  s = s.replace(/[ \t]+/g, "");
  s = s.replace(/^[，。！？；：、\-–—]+/, "");
  return s.trim();
}

function sanitizeStoryBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (!b || typeof b !== "object") return b;
    return {
      ...b,
      zh: sanitizeZhParagraph(b.zh),
    };
  });
}

module.exports = {
  sanitizeZhParagraph,
  sanitizeStoryBlocks,
};
