const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");

const STAGING_MODULES = path.join(ROOT, "build", "standalone_node_modules");

const copies = [
  { from: path.join(ROOT, ".next", "static"), to: path.join(STANDALONE, ".next", "static") },
  { from: path.join(ROOT, "public"), to: path.join(STANDALONE, "public") },
  { from: path.join(STANDALONE, "node_modules"), to: STAGING_MODULES },
];

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const { from, to } of copies) {
  if (!fs.existsSync(from)) {
    console.warn(`[copy-standalone-assets] skip missing: ${from}`);
    continue;
  }
  console.log(`[copy-standalone-assets] ${from} -> ${to}`);
  copyDirSync(from, to);
}

console.log("[copy-standalone-assets] done");
