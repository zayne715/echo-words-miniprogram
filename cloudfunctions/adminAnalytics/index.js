/**
 * 运营看板查询（仅云函数 / 本地脚本调用，勿把 token 写进小程序）。
 *
 * 环境变量（云函数「版本与配置」→ 环境变量）：
 *   ADMIN_ANALYTICS_TOKEN = 随机长字符串（与调用方 event.token 一致）
 *
 * 调用示例（开发者工具 → 云函数 → 云端测试）：
 *   {
 *     "token": "你的 ADMIN_ANALYTICS_TOKEN",
 *     "startDate": "2026-05-01",
 *     "endDate": "2026-05-12"
 *   }
 *
 * 返回：
 *   - range: 区间内按日汇总 + 合计 + 活跃用户数（该日至少有一条 analytics 文档的用户数）
 *   - uniqueUsersInRange: 区间内出现过数据的 openid 去重数量
 *
 * 数据量：单次最多拉取 MAX_DOCS 条（默认 30000），超出部分不会计入。
 */

const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const COLL = "analytics_user_day";
const MAX_DOCS = 30000;
const MAX_RANGE_DAYS = 120;

function validDateKey(s) {
  const k = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : "";
}

function daysBetweenKeys(a, b) {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  const da = new Date(pa[0], pa[1] - 1, pa[2]);
  const db = new Date(pb[0], pb[1] - 1, pb[2]);
  return Math.floor((db - da) / 86400000);
}

function enumerateDateKeys(start, end) {
  const out = [];
  const p = start.split("-").map(Number);
  let d = new Date(p[0], p[1] - 1, p[2]);
  const endTime = new Date(
    Number(end.split("-")[0]),
    Number(end.split("-")[1]) - 1,
    Number(end.split("-")[2])
  ).getTime();
  while (d.getTime() <= endTime) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

exports.main = async (event) => {
  const token = process.env.ADMIN_ANALYTICS_TOKEN || "";
  if (!token || String(event && event.token) !== token) {
    return { ok: false, error: "unauthorized" };
  }

  const startDate = validDateKey(event && event.startDate);
  const endDate = validDateKey(event && event.endDate);
  if (!startDate || !endDate || startDate > endDate) {
    return { ok: false, error: "bad startDate/endDate" };
  }

  if (daysBetweenKeys(startDate, endDate) > MAX_RANGE_DAYS) {
    return { ok: false, error: `range exceeds ${MAX_RANGE_DAYS} days` };
  }

  const db = cloud.database();
  const _ = db.command;
  const coll = db.collection(COLL);

  const rows = [];
  const page = 100;

  try {
    while (rows.length < MAX_DOCS) {
      const res = await coll
        .where({
          dateKey: _.gte(startDate).and(_.lte(endDate)),
        })
        .skip(rows.length)
        .limit(page)
        .get();
      const chunk = (res && res.data) || [];
      if (!chunk.length) break;
      rows.push(...chunk);
      if (chunk.length < page) break;
    }
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
    };
  }

  const truncated = rows.length >= MAX_DOCS;

  const byDay = {};
  enumerateDateKeys(startDate, endDate).forEach((k) => {
    byDay[k] = {
      dateKey: k,
      activeUsers: 0,
      wordsLearned: 0,
      studyMs: 0,
      wordsReviewed: 0,
      reviewMs: 0,
      appOpenCount: 0,
    };
  });

  const openidsInRange = new Set();
  rows.forEach((r) => {
    const dk = r.dateKey;
    if (!dk || !byDay[dk]) return;
    if (r.openid) openidsInRange.add(r.openid);
    const slot = byDay[dk];
    const u = r.openid || "";
    if (!slot._uids) slot._uids = new Set();
    if (u) slot._uids.add(u);

    slot.wordsLearned += Number(r.wordsLearned) || 0;
    slot.studyMs += Number(r.studyMs) || 0;
    slot.wordsReviewed += Number(r.wordsReviewed) || 0;
    slot.reviewMs += Number(r.reviewMs) || 0;
    slot.appOpenCount += Number(r.appOpenCount) || 0;
  });

  const daily = Object.keys(byDay)
    .sort()
    .map((k) => {
      const s = byDay[k];
      const uids = s._uids;
      delete s._uids;
      s.activeUsers = uids ? uids.size : 0;
      return s;
    });

  const sums = daily.reduce(
    (acc, d) => {
      acc.wordsLearned += d.wordsLearned;
      acc.studyMs += d.studyMs;
      acc.wordsReviewed += d.wordsReviewed;
      acc.reviewMs += d.reviewMs;
      acc.appOpenCount += d.appOpenCount;
      acc.activeUsersByDayMax = Math.max(acc.activeUsersByDayMax, d.activeUsers);
      return acc;
    },
    {
      wordsLearned: 0,
      studyMs: 0,
      wordsReviewed: 0,
      reviewMs: 0,
      appOpenCount: 0,
      activeUsersByDayMax: 0,
    }
  );

  return {
    ok: true,
    startDate,
    endDate,
    uniqueUsersInRange: openidsInRange.size,
    docCount: rows.length,
    truncated,
    sums,
    daily,
  };
};
