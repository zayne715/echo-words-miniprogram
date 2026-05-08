function clampProgress(rawValue, totalValue) {
  const total = Math.max(0, Number(totalValue) || 0);
  const raw = Number(rawValue) || 0;
  const clamped = Math.min(Math.max(0, raw), total);
  const pct = total > 0 ? (clamped / total) * 100 : 0;
  return { raw, total, clamped, pct };
}

module.exports = {
  clampProgress,
};
