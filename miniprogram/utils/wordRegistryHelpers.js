function ensureExampleShape(ex, lemma) {
  const lw = String(lemma || "word");
  if (!ex || typeof ex !== "object") {
    return {
      enPre: "",
      enHighlight: lw,
      enPost: ".",
      cn: "",
    };
  }
  return {
    enPre: ex.enPre != null ? String(ex.enPre) : "",
    enHighlight: ex.enHighlight != null ? String(ex.enHighlight) : lw,
    enPost: ex.enPost != null ? String(ex.enPost) : "",
    cn: ex.cn != null ? String(ex.cn) : "",
  };
}

function splitMeaningCombined(str) {
  const s = String(str || "").trim();
  const m = s.match(/^((?:[a-z]+\.)+(?:\s*\/\s*(?:[a-z]+\.)+)*)\s*(.+)$/i);
  if (!m) return { pos: "", meaning: s };
  return { pos: m[1].trim(), meaning: m[2].trim() };
}

function clone(o) {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch (e) {
    return { ...o };
  }
}

function normalizeSessionKeys(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((w) => String(w || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeWordKey(key) {
  if (key === undefined || key === null) return "";
  let s = String(key).trim();
  try {
    s = decodeURIComponent(s);
  } catch (e) {}
  return s.trim().toLowerCase();
}

function emptyWordPlaceholder(key) {
  const k = String(key || "word").toLowerCase();
  return {
    word: k,
    phonetic: "",
    pos: "",
    meaning: "",
    examples: [
      {
        enPre: "",
        enHighlight: k,
        enPost: ".",
        cn: "",
      },
    ],
    inflections: [],
    collocations: [],
    sentencePre: "",
    sentenceHighlight: k,
    sentencePost: ".",
    sentenceCn: "",
    nextWord: "",
  };
}

module.exports = {
  ensureExampleShape,
  splitMeaningCombined,
  clone,
  normalizeSessionKeys,
  normalizeWordKey,
  emptyWordPlaceholder,
};
