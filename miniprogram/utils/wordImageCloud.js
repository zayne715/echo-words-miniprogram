/**
 * 从云开发「存储」按单词名匹配配图，供学习页粉色卡片区展示。
 *
 * 路径约定（与控制台「存储位置」一致）：
 * - 优先：`图片/图片/`（截图里多为双层「图片」目录）。
 * - 再试：`图片/`、存储根目录。
 * - 文件名：`四位数字_单词小写.jpg`；左侧序号默认对齐「合并词表」里的顺序（与数据库/本地 bundle 顺序一致）。
 * - 云图命名必须含该词对应的英文：`0002_单词.jpg` 中的单词须与词条一致（云里是 adverse、词表第二个是 absorb 则永远对不上，需改名或统一词表）。
 *
 * 文件 ID 环境段：
 * - 使用 `getApp().globalData.cloudStorageFileIdEnv`（app.js 里 CLOUD_STORAGE_FILEID_ENV），须与控制台「文件 ID」里
 *   cloud:// 与第一个 / 之间的整段一致（常含 `.636c-…`）；否则短 env 可能拼不出可读路径。
 */

const WORD_IMAGE_CLOUD_DIRS = ["图片/图片", "图片", ""];

/** 与文件名左侧数字上限一致；过大会增加首次解析时的请求次数 */
const WORD_IMAGE_MAX_SCAN_INDEX = 3000;

/** 生成候选 cloud:// ID 时的路径组合上限（避免过长队列） */
const MAX_CANDIDATE_IDS = 360;

const wordRegistry = require("./wordRegistry.js");
const { warn } = require("./devLogger.js");
const {
  fileIdMatchesWord,
  filterFileIdsForWord,
  fileId,
  WORD_IMAGE_CLOUD_DIRS: WORD_IMAGE_CLOUD_DIRS_IMPORTED,
  buildCloudFileIdCandidates: buildCloudFileIdCandidatesRaw,
  buildNumberedFileNames: buildNumberedFileNamesRaw,
} = require("./wordImageCloudNaming.js");

const urlCache = {};

const RESOLVED_FID_STORAGE = "WORD_IMG_RESOLVED_FID_V1";
const resolvedFileIdByWord = {};
/** 首批只试最靠前的候选（与词表序号最接近），减少 getTempFileURL 误命中与等待 */
const PRIORITY_URL_BATCH = 18;
const FULL_URL_BATCH = 50;
const PREFETCH_CONCURRENCY = 3;

(function loadResolvedFileIdsFromStorage() {
  try {
    const o = wx.getStorageSync(RESOLVED_FID_STORAGE);
    if (!o || typeof o !== "object") return;
    Object.keys(o).forEach((k) => {
      const fid = o[k];
      if (typeof fid === "string" && fid.indexOf("cloud://") === 0) {
        resolvedFileIdByWord[String(k).toLowerCase()] = fid;
      }
    });
  } catch (e) {
    warn("wordImageCloud", "读取已解析 fileID 缓存失败", e);
  }
})();

const WORD_IMAGE_DIRS = WORD_IMAGE_CLOUD_DIRS_IMPORTED;

function rememberResolvedFileId(wordKey, fileID, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  const fid = String(fileID || "").trim();
  if (!k || fid.indexOf("cloud://") !== 0) return;
  if (!fileIdMatchesWord(fid, k, displayWord)) return;
  resolvedFileIdByWord[k] = fid;
  try {
    wx.setStorageSync(RESOLVED_FID_STORAGE, { ...resolvedFileIdByWord });
  } catch (e) {
    warn("wordImageCloud", "写入已解析 fileID 缓存失败", e);
  }
}

function runPrefetchQueue(taskFns) {
  const tasks = taskFns || [];
  if (!tasks.length) return Promise.resolve();
  let cursor = 0;
  let running = 0;
  return new Promise((resolve) => {
    const pump = () => {
      while (running < PREFETCH_CONCURRENCY && cursor < tasks.length) {
        const fn = tasks[cursor++];
        running += 1;
        Promise.resolve()
          .then(() => fn())
          .catch(() => {})
          .finally(() => {
            running -= 1;
            if (cursor >= tasks.length && running === 0) resolve();
            else pump();
          });
      }
      if (cursor >= tasks.length && running === 0) resolve();
    };
    pump();
  });
}

function hashWordKey(k) {
  let h = 5381;
  const s = String(k || "").toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h | 0;
  }
  return `w${(h >>> 0).toString(16)}`;
}

function wordImageCachePath(wordKey) {
  const dir = `${wx.env.USER_DATA_PATH}/word_img_cache`;
  try {
    wx.getFileSystemManager().mkdirSync(dir, true);
  } catch (e) {
    warn("wordImageCloud", "创建本地图片缓存目录失败", e);
  }
  return `${dir}/${hashWordKey(wordKey)}.jpg`;
}

function legacyWordImageCachePath(wordKey) {
  const dir = `${wx.env.USER_DATA_PATH}/word_img_cache`;
  return `${dir}/${hashWordKey(wordKey)}.dat`;
}

/** 同步：若本地已有预下载文件则返回路径，供首屏 setData 直接显示（避免先粉后图） */
function getCachedWordImagePathSync(wordKey) {
  const k = String(wordKey || "").toLowerCase().trim();
  if (!k) return "";
  const fs = wx.getFileSystemManager();
  const jpg = wordImageCachePath(k);
  try {
    fs.accessSync(jpg);
    return jpg;
  } catch (e) {}
  const dat = legacyWordImageCachePath(k);
  try {
    fs.accessSync(dat);
    try {
      fs.copyFileSync(dat, jpg);
      return jpg;
    } catch (e2) {
      return dat;
    }
  } catch (e3) {
    return "";
  }
}

function canUpdatePageImage(page, wordKey, loadToken) {
  if (!page || typeof page.setData !== "function") return false;
  if (loadToken && page._wordImageLoadToken !== loadToken) return false;
  const cur = page.data && page.data.wordKey;
  if (!cur) return true;
  return String(cur).toLowerCase() === String(wordKey || "").toLowerCase();
}

function applyWordImageUrl(page, wordKey, baseWd, url, loadToken) {
  if (!canUpdatePageImage(page, wordKey, loadToken)) return;
  const wd = baseWd || {};
  const cur = (page.data && page.data.wordData) || {};
  page.setData({
    wordImageBroken: false,
    wordData: { ...wd, ...cur, imageUrl: url },
  });
}

function persistTempToCache(wordKey, tempFilePath, done) {
  const k = String(wordKey || "").toLowerCase().trim();
  const dest = wordImageCachePath(k);
  const fs = wx.getFileSystemManager();
  fs.readFile({
    filePath: tempFilePath,
    success: (r) => {
      fs.writeFile({
        filePath: dest,
        data: r.data,
        success: () => done && done(dest),
        fail: () => done && done(""),
      });
    },
    fail: () => done && done(""),
  });
}

function isLikelyLocalImagePath(s) {
  const v = String(s || "").trim();
  if (!v) return false;
  if (v.indexOf("wxfile://") === 0) return true;
  try {
    if (wx.env.USER_DATA_PATH && v.indexOf(wx.env.USER_DATA_PATH) === 0) return true;
  } catch (e) {
    warn("wordImageCloud", "读取 USER_DATA_PATH 失败", e);
  }
  return false;
}

function getCloudEnvId() {
  try {
    const app = getApp();
    const id = app && app.globalData && app.globalData.env;
    return typeof id === "string" ? id.trim() : "";
  } catch (e) {
    return "";
  }
}

/** 拼接云文件 ID 用的环境段：优先完整 fileID 段，否则退回短 env */
function getStorageFileIdEnv() {
  try {
    const app = getApp();
    const long = app && app.globalData && app.globalData.cloudStorageFileIdEnv;
    if (typeof long === "string" && long.trim()) return long.trim();
  } catch (e) {
    warn("wordImageCloud", "读取 cloudStorageFileIdEnv 失败，回退短 env", e);
  }
  return getCloudEnvId();
}

function orderedIndexTryList(wordKey) {
  let idx = 0;
  try {
    idx = wordRegistry.getOrderedWordIndex1Based(wordKey) || 0;
  } catch (e) {
    warn("wordImageCloud", "读取词条顺序索引失败，回退全量扫描", e);
  }
  const seen = new Set();
  const out = [];
  const push = (n) => {
    const v = Math.floor(Number(n));
    if (v >= 1 && v <= WORD_IMAGE_MAX_SCAN_INDEX && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  if (idx > 0) {
    [idx, idx - 1, idx + 1, idx - 2, idx + 2, idx + 3, idx - 3].forEach(push);
  }
  for (let n = 1; n <= WORD_IMAGE_MAX_SCAN_INDEX; n++) push(n);
  return out;
}

function buildCloudFileIdCandidates(wordKey, displayWord) {
  const envIds = [];
  const long = getStorageFileIdEnv();
  const short = getCloudEnvId();
  if (long) envIds.push(long);
  if (short && short !== long) envIds.push(short);
  const k = String(wordKey || "").toLowerCase().trim();
  const nums = orderedIndexTryList(k);
  return buildCloudFileIdCandidatesRaw(
    envIds,
    k,
    displayWord,
    nums,
    MAX_CANDIDATE_IDS
  );
}

function buildNumberedFileNames(wordKey, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  const nums = orderedIndexTryList(k);
  return buildNumberedFileNamesRaw(k, displayWord, nums);
}

/** 优先 https 临时链（已校验可读），其次 cloud:// */
function pickPlayableImageMeta(res) {
  const list = (res && res.fileList) || [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it) continue;
    const u = String(it.tempFileURL || "").trim();
    const fid = String(it.fileID || "").trim();
    if (u) return { url: u, fileID: fid };
  }
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it) continue;
    if (it.status !== undefined && it.status !== 0) continue;
    const fid = String(it.fileID || "").trim();
    if (fid.indexOf("cloud://") === 0) return { url: fid, fileID: fid };
  }
  return { url: "", fileID: "" };
}

function pickPlayableImageSrc(res) {
  return pickPlayableImageMeta(res).url;
}

function tryTempUrlsForFileIdsMeta(fileList) {
  if (!fileList || !fileList.length) return Promise.resolve({ url: "", fileID: "" });
  const slice = fileList.slice(0, FULL_URL_BATCH);
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: slice,
      success: (res) => {
        const meta = pickPlayableImageMeta(res);
        if (meta.url) {
          resolve(meta);
          return;
        }
        tryDownloadFirstOk(slice).then((path) => {
          if (path) resolve({ url: path, fileID: slice[0] || "" });
          else resolve({ url: "", fileID: "" });
        });
      },
      fail: () => {
        tryDownloadFirstOk(slice).then((path) => {
          if (path) resolve({ url: path, fileID: slice[0] || "" });
          else resolve({ url: "", fileID: "" });
        });
      },
    });
  });
}

/** 按候选优先级分批换链，命中后记住 fileID，下次只请求 1 个文件 */
function tryResolveImageFromFileIds(fileIds, wordKey, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  const dw = displayWord || k;
  const scoped = filterFileIdsForWord(fileIds, k, dw);
  if (k && urlCache[k]) return Promise.resolve(urlCache[k]);

  const knownFid = k ? resolvedFileIdByWord[k] : "";
  if (knownFid && fileIdMatchesWord(knownFid, k, dw)) {
    return tryTempUrlsForFileIdsMeta([knownFid]).then((meta) => {
      if (meta.url && fileIdMatchesWord(meta.fileID || knownFid, k, dw)) {
        rememberResolvedFileId(k, meta.fileID || knownFid, dw);
        if (meta.url.indexOf("http") === 0) urlCache[k] = meta.url;
        return meta.url;
      }
      return tryResolveImageBatches(scoped, k, dw);
    });
  }
  return tryResolveImageBatches(scoped, k, dw);
}

function tryResolveImageBatches(fileIds, wordKey, displayWord) {
  const list = (fileIds || []).filter(Boolean);
  const k = String(wordKey || "").toLowerCase().trim();
  const dw = displayWord || k;

  function tryRange(start, end) {
    const chunk = list.slice(start, end);
    if (!chunk.length) return Promise.resolve("");
    return tryTempUrlsForFileIdsMeta(chunk).then((meta) => {
      if (meta.url && fileIdMatchesWord(meta.fileID, k, dw)) {
        rememberResolvedFileId(k, meta.fileID, dw);
        if (meta.url.indexOf("http") === 0) urlCache[k] = meta.url;
        return meta.url;
      }
      if (end < list.length) {
        return tryRange(end, Math.min(end + FULL_URL_BATCH, list.length));
      }
      return "";
    });
  }

  return tryRange(0, Math.min(PRIORITY_URL_BATCH, list.length));
}

function tryDownloadFirstOk(fileIds) {
  const ids = (fileIds || []).filter((x) => typeof x === "string" && x.indexOf("cloud://") === 0);
  if (!ids.length) return Promise.resolve("");
  let i = 0;
  function next() {
    if (i >= ids.length) return Promise.resolve("");
    const fileID = ids[i++];
    return new Promise((resolve) => {
      wx.cloud.downloadFile({
        fileID,
        success: (r) => {
          const p = r && r.tempFilePath;
          if (p) resolve(p);
          else next().then(resolve);
        },
        fail: () => next().then(resolve),
      });
    });
  }
  return next();
}

function tryTempUrlsForFileIds(fileList) {
  return tryTempUrlsForFileIdsMeta(fileList).then((m) => m.url || "");
}

function tryFileIdChunks(envId, dir, names) {
  let offset = 0;

  function next() {
    if (offset >= names.length) return Promise.resolve("");
    const chunk = [];
    for (let c = 0; c < 50 && offset < names.length; c++) {
      const id = fileId(envId, dir, names[offset]);
      offset += 1;
      if (id && !chunk.includes(id)) chunk.push(id);
    }
    if (!chunk.length) return Promise.resolve("");
    return tryTempUrlsForFileIds(chunk).then((u) => {
      if (u) return u;
      return next();
    });
  }

  return next();
}

function resolveWithDirs(envId, names) {
  let p = Promise.resolve("");
  WORD_IMAGE_DIRS.forEach((dir) => {
    p = p.then((got) => {
      if (got) return got;
      return tryFileIdChunks(envId, dir, names);
    });
  });
  return p;
}

function resolveWordImageTempUrl(wordKey, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  if (!k || !wx.cloud) return Promise.resolve("");
  if (urlCache[k]) return Promise.resolve(urlCache[k]);

  const envId = getStorageFileIdEnv();
  if (!envId) return Promise.resolve("");

  const names = buildNumberedFileNames(k, displayWord);
  if (!names.length) return Promise.resolve("");

  return resolveWithDirs(envId, names).then((u) => {
    if (u) {
      urlCache[k] = u;
      return u;
    }
    const short = getCloudEnvId();
    if (short && short !== envId) {
      return resolveWithDirs(short, names).then((u2) => {
        if (u2) urlCache[k] = u2;
        return u2 || "";
      });
    }
    return "";
  });
}

/**
 * 用 wx.cloud.downloadFile 把云文件拉到本地临时路径再给 <image>（比直接绑 cloud:// 更稳，开发者工具/真机表现一致）。
 * app.js 必须配置 globalData.cloudStorageFileIdEnv 为控制台「文件 ID」里 cloud:// 与第一个 / 之间的整段。
 */
/** 无页面上下文：下载并写入本地 .jpg 缓存 */
function downloadFirstToCache(wordKey, fileIds, startIndex, displayWord) {
  const wk = String(wordKey || "").toLowerCase().trim();
  const dw = displayWord || wk;
  const list = filterFileIdsForWord(
    (fileIds || []).filter((x) => typeof x === "string" && x.indexOf("cloud://") === 0),
    wk,
    dw
  );
  let i = Math.max(0, Number(startIndex) || 0);
  if (!wk || !wx.cloud) return Promise.resolve("");
  const hit = getCachedWordImagePathSync(wk);
  if (hit) return Promise.resolve(hit);

  return new Promise((resolve) => {
    function next() {
      if (i >= list.length) {
        resolve("");
        return;
      }
      const fileID = list[i++];
      if (!fileIdMatchesWord(fileID, wk, dw)) {
        next();
        return;
      }
      wx.cloud.downloadFile({
        fileID,
        success: (res) => {
          const p = res && res.tempFilePath;
          if (!p) {
            next();
            return;
          }
          rememberResolvedFileId(wk, fileID, dw);
          persistTempToCache(wk, p, (saved) => {
            resolve(saved || p || "");
          });
        },
        fail: () => next(),
      });
    }
    next();
  });
}

function downloadFirstMatch(page, baseWd, fileIds, startIndex, wordKey, displayWord, loadToken) {
  const wk = String(wordKey || "").toLowerCase().trim();
  const dw = displayWord || (baseWd && baseWd.word) || wk;
  const list = filterFileIdsForWord(fileIds || [], wk, dw);
  let i = Math.max(0, Number(startIndex) || 0);
  if (i >= list.length) {
    if (canUpdatePageImage(page, wk, loadToken)) page.setData({ wordImageBroken: true });
    return;
  }
  if (!wx.cloud) {
    if (canUpdatePageImage(page, wk, loadToken)) page.setData({ wordImageBroken: true });
    return;
  }
  const fileID = list[i];
  if (!fileIdMatchesWord(fileID, wk, dw)) {
    downloadFirstMatch(page, baseWd, list, i + 1, wk, dw, loadToken);
    return;
  }
  wx.cloud.downloadFile({
    fileID,
    success: (res) => {
      const p = res && res.tempFilePath;
      if (p) {
        rememberResolvedFileId(wk, fileID, dw);
        page._wordImgCandidates = list;
        page._wordImageDlNextIndex = i + 1;
        applyWordImageUrl(page, wk, baseWd, p, loadToken);
        if (wk) {
          persistTempToCache(wk, p, (saved) => {
            if (saved && saved !== p) applyWordImageUrl(page, wk, baseWd, saved, loadToken);
          });
        }
      } else {
        downloadFirstMatch(page, baseWd, list, i + 1, wk, dw, loadToken);
      }
    },
    fail: () => {
      downloadFirstMatch(page, baseWd, list, i + 1, wk, dw, loadToken);
    },
  });
}

function warmCacheFromFileIds(wordKey, fileIds, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  if (!k || getCachedWordImagePathSync(k)) return;
  downloadFirstToCache(k, fileIds, 0, displayWord).catch(() => {});
}

/**
 * 若词条已有 https 的 imageUrl，则不再猜云路径。
 * 若有 cloud://（数据库），先加入队列下载；否则按「图片/图片」等规则生成候选 fileID 再依次 download。
 */
function attachCloudWordImage(page, wordKey, wordData) {
  const wd = wordData || {};
  const key = String(wordKey || "").toLowerCase().trim();
  const displayWord = wd.word || key;
  const loadToken = `${key}:${Date.now()}`;
  if (page) page._wordImageLoadToken = loadToken;
  const existing = String(wd.imageUrl || "").trim();

  if (existing && /^https?:\/\//i.test(existing)) {
    return Promise.resolve();
  }
  if (existing && isLikelyLocalImagePath(existing)) {
    try {
      wx.getFileSystemManager().accessSync(existing);
      return Promise.resolve();
    } catch (e) {
      warn("wordImageCloud", "本地 imageUrl 校验失败，继续走云图解析", e);
    }
  }

  const diskHit = getCachedWordImagePathSync(key);
  if (diskHit) {
    applyWordImageUrl(page, key, wd, diskHit, loadToken);
    page._wordImgCandidates = [];
    page._wordImageDlNextIndex = 0;
    return Promise.resolve();
  }

  const cand = buildCloudFileIdCandidates(key, displayWord);
  const fileIds = [];
  if (existing.indexOf("cloud://") === 0 && fileIdMatchesWord(existing, key, displayWord)) {
    fileIds.push(existing);
  }
  cand.forEach((id) => {
    if (id && !fileIds.includes(id)) fileIds.push(id);
  });
  const scopedIds = filterFileIdsForWord(fileIds, key, displayWord);

  page._wordImgCandidates = scopedIds.slice();
  page._wordImageDlNextIndex = 0;

  if (!scopedIds.length) {
    return resolveWordImageTempUrl(key, displayWord).then((url) => {
      if (!url || !/^https?:\/\//i.test(url)) return;
      applyWordImageUrl(page, key, wd, url, loadToken);
    });
  }

  if (!wx.cloud) {
    return Promise.resolve();
  }

  /* 真机：先批量换临时 https（比逐个 downloadFile 快很多），再后台落盘 .jpg */
  tryResolveImageFromFileIds(scopedIds, key, displayWord).then((url) => {
    if (url && canUpdatePageImage(page, key, loadToken)) {
      applyWordImageUrl(page, key, wd, url, loadToken);
      page._wordImageDlNextIndex = 1;
      warmCacheFromFileIds(key, scopedIds, displayWord);
      return;
    }
    downloadFirstMatch(page, wd, scopedIds, 0, key, displayWord, loadToken);
  });

  return Promise.resolve();
}

/** 粉色卡片：上图解码失败时试下一个 fileID（再次 download） */
function retryWordImageOnError(page) {
  const wd = (page.data && page.data.wordData) || {};
  const list = page._wordImgCandidates || [];
  const next = page._wordImageDlNextIndex || 0;
  const wk =
    (page.data && page.data.wordKey) ||
    (wd.word && String(wd.word).toLowerCase()) ||
    "";
  const dw = (wd && wd.word) || wk;
  const loadToken = page && page._wordImageLoadToken;
  downloadFirstMatch(page, wd, list, next, wk, dw, loadToken);
}

/** 后台预下载并写入本地缓存（不改变当前页），供「下一词」或首页进入学习前调用 */
function prefetchWordImageForKey(wordKey, displayWord) {
  prefetchWordImageToCache(wordKey, displayWord).catch(() => {});
}

/**
 * 预加载：下载云图并写入 USER_DATA_PATH，返回 Promise（便于跳转前 await）
 */
function prefetchWordImageToCache(wordKey, displayWord) {
  const k = String(wordKey || "").toLowerCase().trim();
  return new Promise((resolve) => {
    if (!k) {
      resolve("");
      return;
    }
    const hit = getCachedWordImagePathSync(k);
    if (hit) {
      resolve(hit);
      return;
    }
    if (!wx.cloud) {
      resolve("");
      return;
    }
    const cand = filterFileIdsForWord(buildCloudFileIdCandidates(k, displayWord), k, displayWord);
    if (!cand.length) {
      resolveWordImageTempUrl(k, displayWord).then(resolve);
      return;
    }
    tryResolveImageFromFileIds(cand, k, displayWord).then((url) => {
      if (url) {
        warmCacheFromFileIds(k, cand, displayWord);
        resolve(url);
        return;
      }
      downloadFirstToCache(k, cand, 0, displayWord).then(resolve);
    });
  });
}

/** 从当前词起向后预取 N 个词（学习页翻页前调用） */
function prefetchWordImageAhead(wordKey, sessionKeys, aheadCount) {
  const cur = String(wordKey || "").toLowerCase().trim();
  const keys = (sessionKeys || [])
    .map((x) => String(x || "").toLowerCase().trim())
    .filter(Boolean);
  if (!cur || !keys.length) return;
  const idx = keys.indexOf(cur);
  if (idx < 0) return;
  const n = Math.max(1, Math.min(6, Number(aheadCount) || 3));
  const wordRegistry = require("./wordRegistry.js");
  for (let i = 1; i <= n; i++) {
    const k = keys[idx + i];
    if (!k || getCachedWordImagePathSync(k)) continue;
    let displayWord = k;
    try {
      const wd = wordRegistry.getWordData(k);
      if (wd && wd.word) displayWord = wd.word;
    } catch (e) {
      warn("wordImageCloud", "预取前读取词条失败，使用 key 兜底", e);
    }
    prefetchWordImageForKey(k, displayWord);
  }
}

/** 学习一组开始时后台预拉本组配图（前 3 个并行，其余限流并发） */
function prefetchLearningSessionWordImages(sessionKeys) {
  const keys = (Array.isArray(sessionKeys) ? sessionKeys : [])
    .map((x) => String(x || "").toLowerCase().trim())
    .filter(Boolean);
  if (!keys.length || !wx.cloud) return Promise.resolve();

  const wordRegistry = require("./wordRegistry.js");
  const makeTask = (k) => () => {
    if (getCachedWordImagePathSync(k)) return Promise.resolve("");
    let displayWord = k;
    try {
      const wd = wordRegistry.getWordData(k);
      if (wd && wd.word) displayWord = wd.word;
    } catch (e) {
      warn("wordImageCloud", "批量预取读取词条失败，使用 key 兜底", e);
    }
    return prefetchWordImageToCache(k, displayWord);
  };

  const head = keys.slice(0, 3).map((k) => makeTask(k));
  const tail = keys.slice(3).map((k) => makeTask(k));

  return Promise.all(head.map((fn) => fn().catch(() => ""))).then(() => runPrefetchQueue(tail));
}

/** 首页空闲时预取「下一组待学」配图 */
function prefetchUpcomingLearningBatchImages() {
  if (!wx.cloud) return Promise.resolve();
  try {
    const { getNextLearningBatchKeys } = require("./wordRegistry.js");
    const { getStudyWordsPerGroup } = require("./studySettings.js");
    const keys = getNextLearningBatchKeys(getStudyWordsPerGroup());
    return prefetchLearningSessionWordImages(keys);
  } catch (e) {
    warn("wordImageCloud", "计算下一组待学图片预取列表失败", e);
    return Promise.resolve();
  }
}

module.exports = {
  attachCloudWordImage,
  retryWordImageOnError,
  resolveWordImageTempUrl,
  prefetchWordImageForKey,
  prefetchWordImageToCache,
  prefetchWordImageAhead,
  prefetchLearningSessionWordImages,
  prefetchUpcomingLearningBatchImages,
  getCachedWordImagePathSync,
  WORD_IMAGE_CLOUD_DIR: WORD_IMAGE_CLOUD_DIRS[0],
  WORD_IMAGE_MAX_SCAN_INDEX,
};
