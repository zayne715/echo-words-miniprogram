// app.js
const { initWordRegistry } = require("./utils/wordRegistry.js");
const {
  tryRestoreLearningFlowOnLaunch,
  tryRestoreReviewFlowOnLaunch,
} = require("./utils/studyFlowCheckpoint.js");
const { refreshWordBankFromCloud } = require("./utils/wordBankCloud.js");
const { warn } = require("./utils/devLogger.js");

/**
 * 云环境 ID：与微信开发者工具 → 云开发 里显示的一致，换环境时只改这里。
 * 部署前请将下方占位符替换为你自己的云环境 ID（云开发控制台 → 环境 → 环境 ID）。
 */
const CLOUD_ENV_ID = "your-cloud-env-id";

/**
 * 云存储 fileID 里「cloud://」与「第一个 /」之间的整段（常带 .636c-…），须与控制台文件详情里复制的一致。
 * 只写短 env 时，拼出来的路径经常读不到图。
 * 部署前请替换为你自己的云存储环境段（可在云存储文件详情中复制 fileID 取前缀）。
 */
const CLOUD_STORAGE_FILEID_ENV =
  "your-cloud-env-id.xxxx-your-cloud-env-id-xxxxxxxxxx";

App({
  onLaunch: function () {
    initWordRegistry();
    /* 待学习数须以云库合并后的总词条为准：在 refreshWordBankFromCloud 成功/失败回调里再对齐，避免此处仅用本地 bundle 误锁为 24 */
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      env: CLOUD_ENV_ID,
      cloudStorageFileIdEnv: CLOUD_STORAGE_FILEID_ENV,
      learningSessionKeys: [],
      round2State: null,
    };
    tryRestoreLearningFlowOnLaunch(this);
    tryRestoreReviewFlowOnLaunch(this);
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      try {
        const { ensurePendingLearnInitialized } = require("./utils/appStatsHub.js");
        const { getMergedWordCount } = require("./utils/wordRegistry.js");
        ensurePendingLearnInitialized(getMergedWordCount());
      } catch (e) {
        warn("app", "stats hub init failed (no cloud)", e);
      }
    } else {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true,
      });
      refreshWordBankFromCloud()
        .then(() => {
          try {
            const { prefetchUpcomingLearningBatchImages } = require("./utils/wordImageCloud.js");
            prefetchUpcomingLearningBatchImages();
          } catch (e) {
            warn("app", "image prefetch init failed", e);
          }
        })
        .catch((e) => {
          warn("app", "cloud word bank refresh failed", e);
        });
    }
  },

  onShow() {
    try {
      const { maybeReportAppOpenOncePerCalendarDay } = require("./utils/analyticsReport.js");
      maybeReportAppOpenOncePerCalendarDay();
    } catch (e) {
      warn("app", "analytics app-open report failed", e);
    }
  },
});
