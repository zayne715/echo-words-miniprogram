const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALLOWED_VOICE_PER,
  DEFAULT_VOICE_PER,
  resolveVoicePer,
} = require("../cloudfunctions/baiduTts/voiceConfig.js");

test("default voice per is 5971", () => {
  assert.equal(DEFAULT_VOICE_PER, 5971);
});

test("resolveVoicePer: no event and no env → default", () => {
  const saved = process.env.BAIDU_TTS_PER;
  delete process.env.BAIDU_TTS_PER;
  try {
    assert.equal(resolveVoicePer({}), 5971);
    assert.equal(resolveVoicePer(null), 5971);
  } finally {
    if (saved !== undefined) process.env.BAIDU_TTS_PER = saved;
  }
});

test("resolveVoicePer: empty env var is ignored → default", () => {
  const saved = process.env.BAIDU_TTS_PER;
  process.env.BAIDU_TTS_PER = "";
  try {
    assert.equal(resolveVoicePer({}), 5971);
  } finally {
    if (saved !== undefined) process.env.BAIDU_TTS_PER = saved;
    else delete process.env.BAIDU_TTS_PER;
  }
});

test("resolveVoicePer: env var takes priority over client value", () => {
  const saved = process.env.BAIDU_TTS_PER;
  process.env.BAIDU_TTS_PER = "0";
  try {
    assert.equal(resolveVoicePer({ per: 5971 }), 0);
  } finally {
    if (saved !== undefined) process.env.BAIDU_TTS_PER = saved;
    else delete process.env.BAIDU_TTS_PER;
  }
});

test("resolveVoicePer: allowlisted client value is accepted when no env var", () => {
  const saved = process.env.BAIDU_TTS_PER;
  delete process.env.BAIDU_TTS_PER;
  try {
    assert.equal(resolveVoicePer({ per: 0 }), 0);
    assert.equal(resolveVoicePer({ per: 1 }), 1);
    assert.equal(resolveVoicePer({ per: 5971 }), 5971);
    assert.equal(resolveVoicePer({ per: 5992 }), 5992);
  } finally {
    if (saved !== undefined) process.env.BAIDU_TTS_PER = saved;
  }
});

test("resolveVoicePer: unknown client value falls back to default", () => {
  const saved = process.env.BAIDU_TTS_PER;
  delete process.env.BAIDU_TTS_PER;
  try {
    assert.equal(resolveVoicePer({ per: 9999 }), 5971);
    assert.equal(resolveVoicePer({ per: -1 }), 5971);
    assert.equal(resolveVoicePer({ per: "arbitrary" }), 5971);
  } finally {
    if (saved !== undefined) process.env.BAIDU_TTS_PER = saved;
  }
});

test("resolveVoicePer: fractional client value is floored before allowlist check", () => {
  const saved = process.env.BAIDU_TTS_PER;
  delete process.env.BAIDU_TTS_PER;
  try {
    assert.equal(resolveVoicePer({ per: 5971.9 }), 5971);
  } finally {
    if (saved !== undefined) process.env.BAIDU_TTS_PER = saved;
  }
});

test("ALLOWED_VOICE_PER is a Set containing the default", () => {
  assert.ok(ALLOWED_VOICE_PER instanceof Set);
  assert.ok(ALLOWED_VOICE_PER.has(DEFAULT_VOICE_PER));
});
