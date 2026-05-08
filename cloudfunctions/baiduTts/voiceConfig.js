/**
 * 百度 TTS 发音人（per）参数安全配置。
 *
 * 允许值来自百度语音技术文档；客户端只能从此集合中选择，
 * 服务端环境变量 BAIDU_TTS_PER 始终优先于客户端传值。
 */

/** 允许客户端请求的 per 值白名单（标准库 + 常见臻品英文音色）*/
const ALLOWED_VOICE_PER = new Set([
  0,    // 度小美（标准女声）
  1,    // 度小宇（标准男声）
  3,    // 度逍遥（亲切男声）
  4,    // 度丫丫（活泼女声）
  5971, // 臻品·度皮特-老外男声（默认英文音色）
  5992, // 臻品·度皮特-老外女声（备选英文音色）
]);

const DEFAULT_VOICE_PER = 5971;

/**
 * 解析最终使用的 per 值：
 *   1. 服务端环境变量 BAIDU_TTS_PER 始终优先。
 *   2. 客户端传值仅在白名单内时有效。
 *   3. 其他情况使用默认值。
 */
function resolveVoicePer(event) {
  // Only read env var when it's a non-empty string:
  // Number("") === 0 would silently override the default with voice 0.
  const envStr = (process.env.BAIDU_TTS_PER || "").trim();
  if (envStr) {
    const fromEnv = Math.floor(Number(envStr));
    if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  }

  // Accept a client-supplied per value only when it is explicitly present:
  // Number(null) === 0 and Number(undefined) === NaN, so we guard up-front.
  const rawPer = event != null ? event.per : undefined;
  if (rawPer !== undefined && rawPer !== null) {
    const fromClient = Math.floor(Number(rawPer));
    if (Number.isFinite(fromClient) && ALLOWED_VOICE_PER.has(fromClient)) return fromClient;
  }

  return DEFAULT_VOICE_PER;
}

module.exports = { ALLOWED_VOICE_PER, DEFAULT_VOICE_PER, resolveVoicePer };
