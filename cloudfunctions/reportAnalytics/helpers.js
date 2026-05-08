function clampInt(n, min, max) {
  const x = Math.floor(Number(n) || 0);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function validDateKey(s) {
  const k = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : "";
}

function buildAnalyticsDocId(openid, dateKey) {
  return `${String(openid || "").trim()}::${String(dateKey || "").trim()}`;
}

/**
 * 每用户每自然日上报调用次数上限。
 * 超出后本次上报将被静默跳过（返回 skipped:true），不影响已累计的数据。
 * 正常用户（学完一组 + 复习 + 打开）通常每天调用不超过 10 次。
 */
const MAX_DAILY_REPORT_CALLS = 100;

function buildAnalyticsIncrementPatch(dbCommand, payload) {
  const patch = {
    updatedAt: dbCommand.serverDate(),
    callCount: dbCommand.command.inc(1),
  };
  if (payload.wordsLearned) patch.wordsLearned = dbCommand.command.inc(payload.wordsLearned);
  if (payload.studyMsDelta) patch.studyMs = dbCommand.command.inc(payload.studyMsDelta);
  if (payload.wordsReviewed) patch.wordsReviewed = dbCommand.command.inc(payload.wordsReviewed);
  if (payload.reviewMsDelta) patch.reviewMs = dbCommand.command.inc(payload.reviewMsDelta);
  if (payload.appOpenInc) patch.appOpenCount = dbCommand.command.inc(payload.appOpenInc);
  return patch;
}

function isDocNotFoundError(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("not exists") || msg.includes("document.get:fail");
}

module.exports = {
  clampInt,
  validDateKey,
  buildAnalyticsDocId,
  buildAnalyticsIncrementPatch,
  isDocNotFoundError,
  MAX_DAILY_REPORT_CALLS,
};
