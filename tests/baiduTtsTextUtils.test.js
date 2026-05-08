const test = require("node:test");
const assert = require("node:assert/strict");

const { truncateUtf8ByBytes } = require("../cloudfunctions/baiduTts/textUtils.js");

test("truncateUtf8ByBytes should keep ascii by byte length", () => {
  assert.equal(truncateUtf8ByBytes("abcdef", 3), "abc");
});

test("truncateUtf8ByBytes should not split utf8 multibyte chars", () => {
  // "你" 是 3 字节，限制 4 字节时不能把第二个中文切半
  assert.equal(truncateUtf8ByBytes("你好a", 4), "你");
  assert.equal(truncateUtf8ByBytes("你好a", 6), "你好");
  assert.equal(truncateUtf8ByBytes("你好a", 7), "你好a");
});
