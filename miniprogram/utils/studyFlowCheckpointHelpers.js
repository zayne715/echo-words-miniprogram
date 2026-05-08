function cloneJson(obj) {
  if (obj === undefined || obj === null) return null;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return null;
  }
}

function normalizeOneWord(word) {
  return String(word || "").trim().toLowerCase();
}

function reviewSigFromWords(words) {
  if (!Array.isArray(words) || !words.length) return "";
  return [
    ...new Set(
      words.map((x) => String(x || "").toLowerCase().trim()).filter(Boolean)
    ),
  ]
    .sort()
    .join("|");
}

function pushUnique(out, word) {
  const w = normalizeOneWord(word);
  if (w && !out.includes(w)) out.push(w);
}

function clampProgress(value, total) {
  const raw = typeof value === "number" ? value : 0;
  return Math.min(Math.max(0, raw), Math.max(0, total));
}

function extractWordFromPath(path) {
  const raw = String(path || "");
  const qIndex = raw.indexOf("?");
  if (qIndex < 0) return "";
  const query = raw.slice(qIndex + 1);
  const parts = query.split("&");
  for (let i = 0; i < parts.length; i++) {
    const pair = parts[i].split("=");
    if (decodeURIComponent(pair[0] || "") === "word") {
      try {
        return normalizeOneWord(decodeURIComponent(pair.slice(1).join("=") || ""));
      } catch (e) {
        return normalizeOneWord(pair.slice(1).join("=") || "");
      }
    }
  }
  return "";
}

function buildPathFromPage(page) {
  const route = (page && page.route) || "";
  if (!route) return "";
  const opts = (page && page.options) || {};
  const keys = Object.keys(opts);
  const qs = keys.length
    ? keys
        .map((k) => {
          const v = opts[k];
          return `${encodeURIComponent(k)}=${encodeURIComponent(v != null ? String(v) : "")}`;
        })
        .join("&")
    : "";
  return `/${route}${qs ? `?${qs}` : ""}`;
}

module.exports = {
  cloneJson,
  normalizeOneWord,
  reviewSigFromWords,
  pushUnique,
  clampProgress,
  extractWordFromPath,
  buildPathFromPage,
};
