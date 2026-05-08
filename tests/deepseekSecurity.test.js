const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  MAX_SYSTEM_PROMPT_LEN,
  MAX_USER_CONTENT_LEN,
  normalizeDeepseekRequest,
} = require("../cloudfunctions/deepseekStory/security.js");

test("normalizeDeepseekRequest should clamp model and temperature", () => {
  const out = normalizeDeepseekRequest({
    systemPrompt: "a",
    userContent: "b",
    model: "unknown-model",
    temperature: 999,
  });
  assert.equal(out.model, DEFAULT_MODEL);
  assert.equal(out.temperature, 1.2);
});

test("normalizeDeepseekRequest should trim and enforce max length", () => {
  const longSystem = `  ${"s".repeat(MAX_SYSTEM_PROMPT_LEN + 10)}  `;
  const longUser = `  ${"u".repeat(MAX_USER_CONTENT_LEN + 10)}  `;
  const out = normalizeDeepseekRequest({
    systemPrompt: longSystem,
    userContent: longUser,
    temperature: "bad",
  });
  assert.equal(out.systemPrompt.length, MAX_SYSTEM_PROMPT_LEN);
  assert.equal(out.userContent.length, MAX_USER_CONTENT_LEN);
  assert.equal(out.temperature, DEFAULT_TEMPERATURE);
});
