const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, "tests");

function listTestFiles(dir, out) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listTestFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.js")) out.push(fullPath);
  }
}

function main() {
  const files = [];
  listTestFiles(TEST_DIR, files);
  files.sort();

  if (!files.length) {
    console.error("No test files found.");
    process.exit(1);
  }

  const result = spawnSync(process.execPath, ["--test", ...files], {
    stdio: "inherit",
  });

  process.exit(result.status === null ? 1 : result.status);
}

main();
