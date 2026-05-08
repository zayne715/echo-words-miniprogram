/**
 * 百度智能云「语音合成」REST API（短文本在线合成 → text2audio），用于英文单词/例句 TTS。
 *
 * 部署说明（标准 OAuth + TTS）：
 * 1. 打开 https://console.bce.baidu.com/ai/#/ai/speech/overview/index 创建应用，开通「语音合成」。
 * 2. 领取应用的 API Key、Secret Key（OAuth client_credentials 使用同一对）。
 * 3. 在微信开发者工具 → 云开发 → 云函数 → baiduTts → 版本与配置 → 环境变量：
 *    BAIDU_API_KEY    = 应用的 API Key
 *    BAIDU_SECRET_KEY = 应用的 Secret Key
 *    （可选）BAIDU_TTS_PER = 发音人 per，未设置且小程序未传 per 时默认 5971（臻品·度皮特）
 * 4. 本目录执行 npm install 后上传部署云函数。
 *
 * 参考：百度语音技术文档 — 短文本在线合成 / text2audio；音色 per 见 https://ai.baidu.com/ai-doc/SPEECH/Rluv3uq3d
 *
 * 臻品音库需控制台开通对应权限；可选环境变量 BAIDU_TTS_PER 覆盖默认发音人（数字）。
 * 默认 per=5971（臻品·度皮特-老外男声），适合英文单词/例句。
 */

const cloud = require("wx-server-sdk");
const https = require("https");
const querystring = require("querystring");
const { truncateUtf8ByBytes } = require("./textUtils.js");
const { resolveVoicePer } = require("./voiceConfig.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

let cachedToken = "";
let tokenExpireAt = 0;
const HTTP_TIMEOUT_MS = 12000;
const MAX_HTTP_BODY_BYTES = 2 * 1024 * 1024;

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, (res) => {
      const chunks = [];
      let total = 0;
      res.on("data", (c) => {
        total += c.length;
        if (total > MAX_HTTP_BODY_BYTES) {
          req.destroy(new Error("response too large"));
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(
            new Error(
              `http ${res.statusCode}: ${body.toString("utf8").slice(0, 200)}`
            )
          );
          return;
        }
        resolve(body);
      });
    });
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
  });
}

function httpsPostForm(hostname, pathStr, postBody) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port: 443,
        path: pathStr,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postBody),
        },
      },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on("data", (c) => {
          total += c.length;
          if (total > MAX_HTTP_BODY_BYTES) {
            req.destroy(new Error("response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
    req.write(postBody);
    req.end();
  });
}

function readCredentials() {
  const clientId =
    process.env.BAIDU_API_KEY || process.env.BAIDU_CLIENT_ID || "";
  const clientSecret =
    process.env.BAIDU_SECRET_KEY || process.env.BAIDU_CLIENT_SECRET || "";
  return { clientId, clientSecret };
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireAt - 60000) {
    return cachedToken;
  }
  const { clientId, clientSecret } = readCredentials();
  if (!clientId || !clientSecret) {
    throw new Error(
      "缺少环境变量：请配置 BAIDU_API_KEY 与 BAIDU_SECRET_KEY（百度语音应用 API Key / Secret Key）"
    );
  }
  const url = `https://openapi.baidu.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(
    clientId
  )}&client_secret=${encodeURIComponent(clientSecret)}`;
  const buf = await httpsGet(url);
  const j = JSON.parse(buf.toString("utf8"));
  if (!j.access_token) {
    throw new Error(j.error_description || j.error || "access_token 获取失败");
  }
  cachedToken = j.access_token;
  tokenExpireAt = now + (j.expires_in || 2592000) * 1000;
  return cachedToken;
}

function truncateTex(s, maxBytes) {
  return truncateUtf8ByBytes(s, maxBytes);
}

exports.main = async (event) => {
  const text = truncateTex(event.text, 950);
  if (!text) {
    return { ok: false, error: "empty text" };
  }
  try {
    const tok = await getAccessToken();
    const per = resolveVoicePer(event);
    const postBody = querystring.stringify({
      tex: text,
      tok,
      ctp: 1,
      cuid: "wx_cloud_baidu_tts",
      lan: "en",
      spd: 5,
      pit: 5,
      vol: 9,
      aue: 3,
      per,
    });
    const res = await httpsPostForm("tsn.baidu.com", "/text2audio", postBody);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return {
        ok: false,
        error: `http ${res.statusCode}: ${res.body.toString("utf8").slice(0, 200)}`,
      };
    }
    const ctype = (res.headers["content-type"] || "").toLowerCase();
    const head = res.body.length ? res.body[0] : 0;
    if (ctype.includes("application/json") || head === 0x7b) {
      try {
        const errObj = JSON.parse(res.body.toString("utf8"));
        return {
          ok: false,
          error: errObj.err_msg || String(errObj.err_no) || "tts error",
        };
      } catch (e) {
        return { ok: false, error: res.body.toString("utf8").slice(0, 200) };
      }
    }
    return {
      ok: true,
      base64: res.body.toString("base64"),
      format: "mp3",
      per,
    };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }
};
