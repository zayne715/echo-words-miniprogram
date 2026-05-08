/**
 * 运营数据上报：按用户 openid + 自然日 dateKey 聚合写入集合 analytics_user_day。
 *
 * 部署前在云开发控制台新建集合：analytics_user_day（可先不设权限，仅云函数读写）。
 * 建议索引：openid + dateKey 联合唯一（控制台 → 索引）。
 *
 * 小程序通过 wx.cloud.callFunction({ name: 'reportAnalytics', data: {...} }) 调用；
 * 仅累加合法增量，openid 来自云函数上下文，客户端不可伪造。
 */

const cloud = require("wx-server-sdk");
const {
  clampInt,
  validDateKey,
  buildAnalyticsDocId,
  buildAnalyticsIncrementPatch,
  isDocNotFoundError,
  MAX_DAILY_REPORT_CALLS,
} = require("./helpers.js");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const COLL = "analytics_user_day";

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  if (!openid) {
    return { ok: false, error: "no openid" };
  }

  const dateKey = validDateKey(event && event.dateKey);
  if (!dateKey) {
    return { ok: false, error: "bad dateKey" };
  }

  const wordsLearned = clampInt(event && event.wordsLearned, 0, 200);
  const studyMsDelta = clampInt(event && event.studyMsDelta, 0, 6 * 60 * 60 * 1000);
  const wordsReviewed = clampInt(event && event.wordsReviewed, 0, 200);
  const reviewMsDelta = clampInt(event && event.reviewMsDelta, 0, 6 * 60 * 60 * 1000);
  const appOpenInc = event && event.appOpen ? clampInt(event.appOpen, 0, 50) : 0;

  const hasAny =
    wordsLearned > 0 ||
    studyMsDelta > 0 ||
    wordsReviewed > 0 ||
    reviewMsDelta > 0 ||
    appOpenInc > 0;
  if (!hasAny) {
    return { ok: true, skipped: true };
  }

  const db = cloud.database();
  const coll = db.collection(COLL);
  const docId = buildAnalyticsDocId(openid, dateKey);

  // Daily call-count guard: silently skip if this user has already exceeded the limit today.
  // This prevents repeated calls from inflating cumulative stats indefinitely.
  try {
    const existingSnap = await coll.doc(docId).get();
    const currentCallCount = (existingSnap.data && existingSnap.data.callCount) || 0;
    if (currentCallCount >= MAX_DAILY_REPORT_CALLS) {
      return { ok: true, skipped: true };
    }
  } catch (readErr) {
    if (!isDocNotFoundError(readErr)) {
      // Unexpected read error — proceed anyway so analytics aren't silently dropped
      console.warn("[reportAnalytics] pre-read failed:", (readErr && readErr.message) || readErr);
    }
    // Doc not found = first call today, callCount is 0; proceed normally
  }

  try {
    const patch = buildAnalyticsIncrementPatch(db, {
      wordsLearned,
      studyMsDelta,
      wordsReviewed,
      reviewMsDelta,
      appOpenInc,
    });
    await coll.doc(docId).update({ data: patch });
    return { ok: true, updated: true };
  } catch (e) {
    if (!isDocNotFoundError(e)) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
      };
    }
  }

  try {
    await coll.doc(docId).set({
      data: {
        _id: docId,
        openid,
        dateKey,
        wordsLearned: 0,
        studyMs: 0,
        wordsReviewed: 0,
        reviewMs: 0,
        appOpenCount: 0,
        callCount: 0,
        updatedAt: db.serverDate(),
      },
    });
    const patch = buildAnalyticsIncrementPatch(db, {
      wordsLearned,
      studyMsDelta,
      wordsReviewed,
      reviewMsDelta,
      appOpenInc,
    });
    await coll.doc(docId).update({ data: patch });
    return { ok: true, created: true };
  } catch (e) {
    try {
      const patch = buildAnalyticsIncrementPatch(db, {
        wordsLearned,
        studyMsDelta,
        wordsReviewed,
        reviewMsDelta,
        appOpenInc,
      });
      await coll.doc(docId).update({ data: patch });
      return { ok: true, updated: true };
    } catch (e2) {
      return {
        ok: false,
        error: e2 && e2.message ? e2.message : String(e2),
      };
    }
  }
};
