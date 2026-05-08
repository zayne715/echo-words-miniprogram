const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeCloudDoc } = require("../miniprogram/utils/wordBankCloud.js");

test("normalizeCloudDoc should map zh schema to normalized shape", () => {
  const doc = normalizeCloudDoc({
    单词: "Abandon",
    音标: "/əˈbændən/",
    释义: "v. 放弃",
    例句: "He abandoned the plan.",
    例句翻译: "他放弃了这个计划。",
    三单: "abandons",
    过去式: "abandoned",
    过去分词: "abandoned",
    现在分词: "abandoning",
    词组搭配1: "abandon plan",
    "词组搭配1 (释义)": "放弃计划",
  });

  assert.ok(doc);
  assert.equal(doc.word, "abandon");
  assert.equal(doc.pos, "v.");
  assert.equal(doc.meaning, "放弃");
  assert.ok(Array.isArray(doc.examples));
  assert.ok(doc.examples.length > 0);
  assert.ok(Array.isArray(doc.inflections));
  assert.ok(Array.isArray(doc.collocations));
});

test("normalizeCloudDoc should return null when word missing", () => {
  assert.equal(normalizeCloudDoc({ 释义: "test" }), null);
});
