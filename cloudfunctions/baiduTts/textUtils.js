function truncateUtf8ByBytes(input, maxBytes) {
  const src = String(input || "").trim();
  const limit = Math.max(0, Math.floor(Number(maxBytes) || 0));
  if (!src || limit <= 0) return "";
  let out = "";
  let used = 0;
  for (const ch of src) {
    const bytes = Buffer.byteLength(ch, "utf8");
    if (used + bytes > limit) break;
    out += ch;
    used += bytes;
  }
  return out;
}

module.exports = {
  truncateUtf8ByBytes,
};
