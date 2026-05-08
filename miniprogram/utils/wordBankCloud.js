/**
 * 从云数据库读取单词库，写入 wordRegistry。
 *
 * 在云开发控制台新建集合（默认名见 WORD_BANK_COLLECTION）。支持英文字段与控制台常见中文字段：
 * - 单词 / word（必填）原形
 * - 音标 / phonetic
 * - 释义 / meaning（可与词性写在一起，如 "v. 大量存在"）
 * - imageUrl / image…（可选；词条配图；不再读取数据库字段「图片」，另找方案后可再接）
 * - 例句 + 例句翻译（主例句，对应学习页图片下方）；例句1 + 例句1（翻译）… 全部进入 examples 数组
 * - 词组搭配1 + 词组搭配1 (释义) …（最多扫描 1–12）
 * - 三单、现在分词、过去式、过去分词 → inflections 行展示
 * - 亦兼容 example、examples、collocations 等英文结构
 *
 * 数据库权限需在控制台允许「读」给登录用户或所有用户可读（按你的安全策略配置）。
 */

const { warn } = require("./devLogger.js");

/** 与云开发「集合名称」一致；若你的集合不叫 words，改这里 */
const WORD_BANK_COLLECTION = "words";

/** 小程序端数据库查询单次 get 通常最多返回 20 条，按 20 分页直到取空。 */
const PAGE_SIZE = 20;

function pick(obj, keys, def = "") {
  if (!obj) return def;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return def;
}

function splitMeaningCombined(str) {
  const s = String(str || "").trim();
  const m = s.match(/^([a-z]+\.)\s*(.+)$/i);
  if (m) return { pos: m[1], meaning: m[2] };
  return { pos: "", meaning: s };
}

function splitExampleSentence(fullEn, lemma, cn) {
  const full = String(fullEn || "");
  const lw = String(lemma || "").toLowerCase();
  const lower = full.toLowerCase();
  const idx = lower.indexOf(lw);
  if (lw && idx >= 0) {
    return {
      enPre: full.slice(0, idx),
      enHighlight: full.slice(idx, idx + lemma.length),
      enPost: full.slice(idx + lemma.length),
      cn: cn || "",
    };
  }
  return {
    enPre: full ? `${full} ` : "",
    enHighlight: lemma || "word",
    enPost: "",
    cn: cn || "",
  };
}

/** 与控制台一致：半角/全角括号、「翻译」字段名 */
function pickZhExampleCn(raw, index) {
  if (index === 0) {
    return pick(raw, ["例句翻译", "exampleCn", "example_cn", "sentenceCn", "sentence_cn"], "");
  }
  const n = String(index);
  return pick(
    raw,
    [`例句${n} (翻译)`, `例句${n}（翻译）`, `例句${n}(翻译)`],
    ""
  );
}

/**
 * 云库「例句 / 例句翻译」与「例句1…」全部写入 examples（顺序：主例句 → 例句1 → 例句2…）。
 * 学习页图片下方展示的是 examples[0]（见 wordRegistry.attachDerivedFields）。
 */
function collectZhExamples(raw, word, examples) {
  const mainEn = pick(raw, ["例句", "example", "example_en", "sentence", "sentence_en"], "");
  const mainCn = pickZhExampleCn(raw, 0);
  if (mainEn) {
    examples.push(splitExampleSentence(mainEn, word, mainCn));
  }
  for (let i = 1; i <= 8; i++) {
    const enKey = `例句${i}`;
    const en = raw[enKey];
    if (typeof en === "string" && en.trim()) {
      const cn = pickZhExampleCn(raw, i);
      examples.push(splitExampleSentence(en, word, cn));
    }
  }
}

function pickZhCollocationGloss(raw, i) {
  const n = String(i);
  return pick(raw, [`词组搭配${n} (释义)`, `词组搭配${n}（释义）`, `词组搭配${n}(释义)`], "");
}

function collectZhCollocations(raw, collocations) {
  for (let i = 1; i <= 12; i++) {
    const enKey = `词组搭配${i}`;
    const en = raw[enKey];
    if (typeof en === "string" && en.trim()) {
      const gloss = pickZhCollocationGloss(raw, i);
      collocations.push([en.trim(), gloss]);
    }
  }
}

function collectZhInflections(raw) {
  const pairs = [
    ["三单", pick(raw, ["三单"], "")],
    ["过去式", pick(raw, ["过去式"], "")],
    ["过去分词", pick(raw, ["过去分词"], "")],
    ["现在分词", pick(raw, ["现在分词"], "")],
  ];
  const out = [];
  pairs.forEach(([label, v]) => {
    if (v) out.push([label, String(v)]);
  });
  return out;
}

function normalizeCloudDoc(raw) {
  const wordRaw = pick(raw, ["单词", "word", "english", "text", "Word"], "");
  const word = String(wordRaw || "")
    .trim()
    .toLowerCase();
  if (!word) return null;

  let pos = pick(raw, ["pos", "partOfSpeech", "wordClass"], "");
  let meaning = pick(raw, ["释义", "meaning", "gloss", "cn", "translation"], "");
  if (!pos && meaning) {
    const sp = splitMeaningCombined(meaning);
    pos = sp.pos;
    meaning = sp.meaning;
  }

  const phonetic = pick(raw, ["音标", "phonetic", "phon", "ipa"], "");
  const imageUrl = pick(raw, ["imageUrl", "image", "img", "pic", "picture", "url"], "");

  const examples = [];

  const exArr = raw.examples;
  if (Array.isArray(exArr)) {
    exArr.forEach((item) => {
      if (typeof item === "string") {
        examples.push(splitExampleSentence(item, word, ""));
      } else if (item && typeof item.en === "string") {
        examples.push(splitExampleSentence(item.en, word, item.cn || ""));
      } else if (item && item.enPre !== undefined) {
        examples.push({
          enPre: item.enPre || "",
          enHighlight: item.enHighlight || word,
          enPost: item.enPost || "",
          cn: item.cn || "",
        });
      }
    });
  }

  if (!examples.length) {
    collectZhExamples(raw, word, examples);
  }

  const singleEn = pick(raw, ["例句", "example", "example_en", "sentence", "sentence_en"], "");
  const singleCn = pick(raw, ["例句翻译", "exampleCn", "example_cn", "sentenceCn", "sentence_cn"], "");
  if (!examples.length && singleEn) {
    examples.push(splitExampleSentence(singleEn, word, singleCn));
  }
  if (!examples.length) {
    examples.push({
      enPre: "",
      enHighlight: word,
      enPost: ".",
      cn: meaning || "",
    });
  }

  let collocations = [];
  const col = raw.collocations || raw.phrases || raw.collocation;
  if (Array.isArray(col)) {
    col.forEach((c) => {
      if (Array.isArray(c) && c.length >= 2) {
        collocations.push([String(c[0]), String(c[1])]);
      } else if (typeof c === "string") {
        collocations.push([c, ""]);
      }
    });
  }
  if (!collocations.length) {
    collectZhCollocations(raw, collocations);
  }

  let inflections = [];
  if (Array.isArray(raw.inflections)) {
    inflections = raw.inflections.slice();
  }
  const zhInfl = collectZhInflections(raw);
  if (zhInfl.length) {
    inflections = zhInfl;
  }

  return {
    word,
    phonetic,
    pos,
    meaning,
    examples,
    inflections,
    collocations,
    imageUrl,
  };
}

function fetchCollectionAll(db, name) {
  return new Promise((resolve, reject) => {
    const all = [];
    const pull = (skip) => {
      db.collection(name)
        .skip(skip)
        .limit(PAGE_SIZE)
        .get({
          success(res) {
            const chunk = res.data || [];
            for (let i = 0; i < chunk.length; i++) {
              all.push(chunk[i]);
            }
            if (chunk.length < PAGE_SIZE) {
              resolve(all);
            } else {
              pull(skip + PAGE_SIZE);
            }
          },
          fail: reject,
        });
    };
    pull(0);
  });
}

/**
 * 拉取云库并刷新 registry（失败仅打日志，保留本地缓存词表）
 */
function refreshWordBankFromCloud() {
  if (!wx.cloud) {
    return Promise.resolve();
  }
  const { applyCloudWords } = require("./wordRegistry.js");
  const db = wx.cloud.database();
  return fetchCollectionAll(db, WORD_BANK_COLLECTION)
    .then((rows) => {
      const overlayNew = {};
      const ordered = [];
      (rows || []).forEach((raw) => {
        const n = normalizeCloudDoc(raw);
        if (n) {
          overlayNew[n.word] = n;
          ordered.push(n.word);
        }
      });
      if (!ordered.length) {
        console.warn("[wordBankCloud] 集合无有效词条，保持本地缓存不变");
        try {
          const { ensurePendingLearnInitialized } = require("./appStatsHub.js");
          const { getMergedWordCount } = require("./wordRegistry.js");
          ensurePendingLearnInitialized(getMergedWordCount());
        } catch (e) {
          warn("wordBankCloud", "post-sync stats init failed (empty bank)", e);
        }
        return;
      }
      applyCloudWords(overlayNew, ordered);
      try {
        const { ensurePendingLearnInitialized } = require("./appStatsHub.js");
        const {
          getMergedWordCount,
          ensureLearningSessionMatchesSettings,
        } = require("./wordRegistry.js");
        ensurePendingLearnInitialized(getMergedWordCount());
        const app = getApp();
        ensureLearningSessionMatchesSettings(app);
      } catch (e) {
        warn("wordBankCloud", "post-sync session alignment failed", e);
      }
    })
    .catch((err) => {
      console.warn("[wordBankCloud] fetch failed:", err);
      try {
        const { ensurePendingLearnInitialized } = require("./appStatsHub.js");
        const { getMergedWordCount } = require("./wordRegistry.js");
        ensurePendingLearnInitialized(getMergedWordCount());
      } catch (e) {
        warn("wordBankCloud", "fallback stats init failed", e);
      }
    });
}

module.exports = {
  WORD_BANK_COLLECTION,
  refreshWordBankFromCloud,
  normalizeCloudDoc,
};
