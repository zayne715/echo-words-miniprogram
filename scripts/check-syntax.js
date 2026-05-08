const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = process.cwd();
const TARGET_DIRS = ["miniprogram", "cloudfunctions"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".github"]);

function listJsFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) listJsFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) out.push(fullPath);
  }
}

function main() {
  const files = [];
  for (const d of TARGET_DIRS) listJsFiles(path.join(ROOT, d), files);
  const failed = [];

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    try {
      new vm.Script(code, { filename: file });
    } catch (err) {
      failed.push({ file, err: err && err.message ? err.message : String(err) });
    }
  }

  if (failed.length) {
    console.error("Syntax check failed:");
    failed.forEach((item) => console.error(`- ${item.file}\n  ${item.err}`));
    process.exit(1);
  }

  console.log(`Syntax check passed for ${files.length} JS files.`);
}

main();
