const DEFAULT_MODEL = "deepseek-chat";
const ALLOWED_MODELS = new Set([DEFAULT_MODEL]);
const DEFAULT_TEMPERATURE = 0.55;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 1.2;
const MAX_SYSTEM_PROMPT_LEN = 4000;
const MAX_USER_CONTENT_LEN = 12000;

function normalizeTextInput(value, maxLen) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return "";
  return s.slice(0, Math.max(0, Number(maxLen) || 0));
}

function normalizeModel(value) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model) return DEFAULT_MODEL;
  return ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * 兼容旧调用：当前小程序端仍传 systemPrompt/userContent。
 * 为保持线上协议不变，这里只做严格归一化与长度/范围限制，不直接信任原始输入。
 */
function normalizeDeepseekRequest(event) {
  const safeEvent = event || {};
  const systemPrompt = normalizeTextInput(safeEvent.systemPrompt, MAX_SYSTEM_PROMPT_LEN);
  const userContent = normalizeTextInput(safeEvent.userContent, MAX_USER_CONTENT_LEN);
  const model = normalizeModel(safeEvent.model);
  const temperature = clampNumber(
    safeEvent.temperature,
    MIN_TEMPERATURE,
    MAX_TEMPERATURE,
    DEFAULT_TEMPERATURE
  );
  return { systemPrompt, userContent, model, temperature };
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  MAX_SYSTEM_PROMPT_LEN,
  MAX_USER_CONTENT_LEN,
  normalizeDeepseekRequest,
};
