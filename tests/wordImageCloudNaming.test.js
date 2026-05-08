const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fileId,
  fileIdMatchesWord,
  filterFileIdsForWord,
  buildNumberedFileNames,
} = require("../miniprogram/utils/wordImageCloudNaming.js");

test("wordImageCloudNaming fileId and matcher", () => {
  const fid = fileId("env1", "图片/图片", "0002_absorb.jpg");
  assert.equal(fid, "cloud://env1/图片/图片/0002_absorb.jpg");
  assert.equal(fileIdMatchesWord(fid, "absorb", "absorb"), true);
  assert.equal(fileIdMatchesWord(fid, "adapt", "adapt"), false);
});

test("wordImageCloudNaming filter and filename list", () => {
  const ids = [
    "cloud://env1/图片/图片/0002_absorb.jpg",
    "cloud://env1/图片/图片/0003_adapt.jpg",
  ];
  const filtered = filterFileIdsForWord(ids, "absorb", "absorb");
  assert.deepEqual(filtered, ["cloud://env1/图片/图片/0002_absorb.jpg"]);

  const names = buildNumberedFileNames("absorb", "absorb", [2]);
  assert.ok(names.includes("0002_absorb.jpg"));
});
