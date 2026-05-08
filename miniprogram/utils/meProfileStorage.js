/**
 * Me 页：昵称、头像（chooseAvatar 临时路径会过期，保存时复制到 USER_DATA_PATH）
 */
const { warn } = require("./devLogger.js");

const STORAGE_KEY = "ME_USER_PROFILE_V1";
const DEFAULT_NICK = "Learner";
const AVATAR_FILE = "avatar.jpg";

function avatarDir() {
  return `${wx.env.USER_DATA_PATH}/me_profile`;
}

function persistedAvatarPath() {
  return `${avatarDir()}/${AVATAR_FILE}`;
}

function ensureAvatarDir() {
  const fs = wx.getFileSystemManager();
  try {
    fs.mkdirSync(avatarDir(), true);
  } catch (e) {}
}

function fileExists(path) {
  const p = String(path || "").trim();
  if (!p) return false;
  try {
    wx.getFileSystemManager().accessSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function readStorageRaw() {
  try {
    const r = wx.getStorageSync(STORAGE_KEY);
    if (r && typeof r === "object") return r;
  } catch (e) {
    warn("meProfileStorage", "readStorageRaw failed", e);
  }
  return null;
}

function resolveAvatarUrl(stored) {
  const url = String(stored || "").trim();
  if (url && fileExists(url)) return url;
  const fallback = persistedAvatarPath();
  if (fileExists(fallback)) return fallback;
  return "";
}

function getMeProfile() {
  const r = readStorageRaw();
  if (r) {
    return {
      nickName: String(r.nickName || "").trim() || DEFAULT_NICK,
      avatarUrl: resolveAvatarUrl(r.avatarUrl),
    };
  }
  return { nickName: DEFAULT_NICK, avatarUrl: "" };
}

function setMeProfile(p) {
  const nickName = String((p && p.nickName) || "").trim() || DEFAULT_NICK;
  const avatarUrl = resolveAvatarUrl((p && p.avatarUrl) || "");
  try {
    wx.setStorageSync(STORAGE_KEY, { nickName, avatarUrl });
  } catch (e) {
    warn("meProfileStorage", "setMeProfile failed", e);
  }
  return { nickName, avatarUrl };
}

/** 将临时/本地头像复制到持久目录后再写入 storage */
function persistAvatarFromSrc(srcPath) {
  return new Promise((resolve) => {
    const src = String(srcPath || "").trim();
    if (!src) {
      resolve("");
      return;
    }
    const dest = persistedAvatarPath();
    if (src === dest && fileExists(dest)) {
      resolve(dest);
      return;
    }
    if (!fileExists(src)) {
      resolve(resolveAvatarUrl(dest));
      return;
    }
    ensureAvatarDir();
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: src,
      success: (r) => {
        fs.writeFile({
          filePath: dest,
          data: r.data,
          success: () => resolve(dest),
          fail: () => resolve(resolveAvatarUrl(dest)),
        });
      },
      fail: () => resolve(resolveAvatarUrl(dest)),
    });
  });
}

function setMeProfileAsync(p) {
  const nickName = String((p && p.nickName) || "").trim() || DEFAULT_NICK;
  const avatarUrl = String((p && p.avatarUrl) || "").trim();
  if (!avatarUrl) {
    return Promise.resolve(setMeProfile({ nickName, avatarUrl: "" }));
  }
  return persistAvatarFromSrc(avatarUrl).then((saved) =>
    setMeProfile({ nickName, avatarUrl: saved || "" })
  );
}

/** Sign Out：仅恢复默认昵称与头像，不影响学习/复习等其它本地数据 */
function resetMeProfileToDefault() {
  const dest = persistedAvatarPath();
  if (fileExists(dest)) {
    try {
      wx.getFileSystemManager().unlinkSync(dest);
    } catch (e) {
      warn("meProfileStorage", "resetMeProfile unlinkSync failed", e);
    }
  }
  try {
    wx.setStorageSync(STORAGE_KEY, { nickName: DEFAULT_NICK, avatarUrl: "" });
  } catch (e) {
    warn("meProfileStorage", "resetMeProfile setStorageSync failed", e);
  }
  return { nickName: DEFAULT_NICK, avatarUrl: "" };
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_NICK,
  getMeProfile,
  setMeProfile,
  setMeProfileAsync,
  persistAvatarFromSrc,
  resetMeProfileToDefault,
};
