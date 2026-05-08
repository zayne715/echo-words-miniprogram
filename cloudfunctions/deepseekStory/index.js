const cloud = require("wx-server-sdk");
const https = require("https");
const { DEFAULT_MODEL, normalizeDeepseekRequest } = require("./security.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const HTTP_TIMEOUT_MS = 20000;
const MAX_HTTP_BODY_BYTES = 2 * 1024 * 1024;
function httpsPostJson(urlString, headers, jsonBody) {
  const url = new URL(urlString);
  const body = Buffer.from(jsonBody, "utf8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let raw = "";
        let total = 0;
        res.on("data", (c) => {
          total += Buffer.byteLength(c);
          if (total > MAX_HTTP_BODY_BYTES) {
            req.destroy(new Error("response too large"));
            return;
          }
          raw += c;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`http ${res.statusCode}: ${raw.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`解析响应失败: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractAssistantText(apiJson) {
  const choice = apiJson && apiJson.choices && apiJson.choices[0];
  const msg = choice && choice.message;
  const content = msg && msg.content;
  return typeof content === "string" ? content : "";
}

function extractJsonObject(text) {
  const s = String(text || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fence ? fence[1].trim() : s;
  return JSON.parse(inner);
}

function sanitizeZhParagraph(zh) {
  let s = String(zh || "").trim();
  if (!s) return s;
  s = s.replace(/[a-zA-Z][a-zA-Z0-9''\-]*/g, "");
  s = s.replace(/[ \t]+/g, "");
  s = s.replace(/^[，。！？；：、\-–—]+/, "");
  return s.trim();
}

function normalizeStory(parsed, genreKey, genreLabel) {
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const safeBlocks = [];
  let plainEn = "";
  let plainZh = "";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const parts = Array.isArray(b.enParts) ? b.enParts : [];
    let enLine = "";
    for (const p of parts) {
      if (p && p.text !== undefined && p.text !== null) {
        enLine += String(p.text);
      }
    }
    const zh = sanitizeZhParagraph((b && b.zh) || "");
    if (!enLine && !zh) continue;
    safeBlocks.push({
      enParts: parts.filter((p) => p && (p.type === "text" || p.type === "word")),
      zh,
    });
    plainEn += (plainEn ? "\n\n" : "") + enLine;
    plainZh += (plainZh ? "\n\n" : "") + zh;
  }
  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Your Story";
  const metaLine =
    typeof parsed.metaLine === "string" && parsed.metaLine.trim()
      ? parsed.metaLine.trim()
      : `${genreLabel} · Generated just now`;
  return {
    title,
    metaLine,
    blocks: safeBlocks,
    plainEn,
    plainZh,
    genreKey,
    genreLabel,
  };
}

exports.main = async (event) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      errMsg:
        "云函数未配置环境变量 DEEPSEEK_API_KEY。请在微信云开发控制台为该云函数添加密钥。",
    };
  }

  const normalized = normalizeDeepseekRequest(event);
  const systemPrompt = normalized.systemPrompt;
  const userContent = normalized.userContent;
  if (!systemPrompt || !userContent) {
    return { ok: false, errMsg: "缺少 systemPrompt 或 userContent" };
  }

  const genreKey = event.genreKey || "";
  const genreLabel = event.genreLabel || genreKey || "";

  const payload = JSON.stringify({
    // 兼容旧调用：保持调用协议不变，但只使用服务端归一化后的安全值
    model: normalized.model || DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: normalized.temperature,
    stream: false,
  });

  try {
    const apiJson = await httpsPostJson(
      DEEPSEEK_URL,
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      payload
    );

    if (apiJson.error) {
      return {
        ok: false,
        errMsg: apiJson.error.message || JSON.stringify(apiJson.error),
      };
    }

    const assistantText = extractAssistantText(apiJson);
    if (!assistantText) {
      return { ok: false, errMsg: "模型未返回内容" };
    }

    let parsed;
    try {
      parsed = extractJsonObject(assistantText);
    } catch (e) {
      return {
        ok: false,
        errMsg: `无法解析为 JSON：${e.message || e}`,
        raw: assistantText.slice(0, 500),
      };
    }

    const story = normalizeStory(parsed, genreKey, genreLabel);
    if (!story.blocks.length) {
      return {
        ok: false,
        errMsg: "JSON 中 blocks 为空",
        raw: assistantText.slice(0, 500),
      };
    }

    return { ok: true, story };
  } catch (e) {
    return {
      ok: false,
      errMsg: e.message || String(e),
    };
  }
};
