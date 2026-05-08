/**
 * 百度智能云语音合成（标准接入）
 *
 * - 小程序端只调 wx.cloud.callFunction({ name: 'baiduTts', data: { text, per } })，密钥只在云函数环境变量中。
 * - 云函数 cloudfunctions/baiduTts：OAuth token + text2audio，返回 mp3 base64。
 * - 本地写入 wx.env.USER_DATA_PATH/tts_cache 复用，避免重复请求。
 *
 * 部署：上传云函数，环境变量 BAIDU_API_KEY、BAIDU_SECRET_KEY（与百度语音控制台应用一致）。
 * 臻品发音人 per 与云函数约定一致（默认 5971 度皮特-老外男声）；改音色需同步改云函数侧默认值或传参。
 */

/** 短文本在线合成·臻品音库（与 cloudfunctions/baiduTts 默认 per 保持一致） */
const TTS_REQUEST_PER = 5971;

let innerAudio = null;

function hashStr(s) {
  let h = 5381;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h | 0;
  }
  return `t${(h >>> 0).toString(16)}`;
}

function getInnerAudio() {
  if (!innerAudio) {
    innerAudio = wx.createInnerAudioContext();
    innerAudio.obeyMuteSwitch = true;
    innerAudio.onError(() => {});
  }
  return innerAudio;
}

function ensureDir(dir) {
  if (!dir) return;
  try {
    wx.getFileSystemManager().mkdirSync(dir, true);
  } catch (e) {}
}

function cachePathForText(text) {
  const dir = `${wx.env.USER_DATA_PATH}/tts_cache`;
  ensureDir(dir);
  const key = hashStr(String(text).trim().toLowerCase());
  return `${dir}/${key}_p${TTS_REQUEST_PER}.mp3`;
}

function fetchTtsToPath(text) {
  const t = String(text || "").trim();
  if (!t) return Promise.reject(new Error("empty"));
  const path = cachePathForText(t);
  try {
    wx.getFileSystemManager().accessSync(path);
    return Promise.resolve(path);
  } catch (e) {}

  if (!wx.cloud) {
    return Promise.reject(new Error("no cloud"));
  }

  return wx.cloud
    .callFunction({
      name: "baiduTts",
      data: { text: t, per: TTS_REQUEST_PER },
    })
    .then((res) => {
      const r = (res && res.result) || {};
      if (!r.ok || !r.base64) {
        throw new Error(r.error || "tts failed");
      }
      ensureDir(`${wx.env.USER_DATA_PATH}/tts_cache`);
      wx.getFileSystemManager().writeFileSync(path, r.base64, "base64");
      return path;
    });
}

function playFile(path) {
  const a = getInnerAudio();
  a.stop();
  a.src = path;
  a.play();
}

function playWordTts(word) {
  const w = String(word || "").trim();
  if (!w) return Promise.resolve();
  return fetchTtsToPath(w).then((p) => playFile(p));
}

/** 页面1 粉色卡片下首条例句：完整英文一句 */
function playFirstExampleSentenceTts(wordData) {
  const wd = wordData || {};
  const ex0 = wd.examples && wd.examples[0];
  let sent = "";
  if (ex0) {
    sent = `${ex0.enPre || ""}${ex0.enHighlight || ""}${ex0.enPost || ""}`.trim();
  }
  if (!sent && wd.sentencePre !== undefined) {
    sent = `${wd.sentencePre || ""}${wd.sentenceHighlight || ""}${wd.sentencePost || ""}`.trim();
  }
  if (!sent) return Promise.resolve();
  return fetchTtsToPath(sent).then((p) => playFile(p));
}

function prefetchTtsTexts(texts) {
  const arr = []
    .concat(texts || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (!arr.length) return Promise.resolve();
  return Promise.all(arr.map((t) => fetchTtsToPath(t).catch(() => {})));
}

function prefetchWordPage1Pack(wordData) {
  if (!wordData || !wordData.word) return Promise.resolve();
  const texts = [wordData.word];
  const ex0 = wordData.examples && wordData.examples[0];
  let sent = "";
  if (ex0) {
    sent = `${ex0.enPre || ""}${ex0.enHighlight || ""}${ex0.enPost || ""}`.trim();
  }
  if (!sent && wordData.sentencePre !== undefined) {
    sent = `${wordData.sentencePre || ""}${wordData.sentenceHighlight || ""}${wordData.sentencePost || ""}`.trim();
  }
  if (sent) texts.push(sent);
  return prefetchTtsTexts(texts);
}

/** 页面1 自动播单词：预取完成后再等一小段时间，避免与转场动画抢声道；默认偏短以尽快出声 */
const DEFAULT_AUTO_PLAY_WORD_DELAY_MS = 140;

/** 进入页面1：自动播单词（仅单词），在预加载完成后调用 */
function scheduleAutoPlayWord(word, delayMs) {
  const ms = typeof delayMs === "number" ? delayMs : DEFAULT_AUTO_PLAY_WORD_DELAY_MS;
  const w = String(word || "").trim();
  if (!w) return;
  setTimeout(() => {
    playWordTts(w).catch(() => {});
  }, ms);
}

module.exports = {
  playWordTts,
  playFirstExampleSentenceTts,
  prefetchTtsTexts,
  prefetchWordPage1Pack,
  scheduleAutoPlayWord,
  fetchTtsToPath,
};
