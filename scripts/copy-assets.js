// 将项目根目录下的 icons 复制到常见构建输出目录
const fs = require("fs");
const path = require("path");

/**
 * 复制目录
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const iconsSrc = path.join(process.cwd(), "icons");
const iconTargets = [
  path.join(process.cwd(), "dist", "icons"),
  path.join(process.cwd(), ".output", "extension", "icons"),
  path.join(process.cwd(), ".output", "chrome-mv3", "icons"),
];
for (const t of iconTargets) {
  try {
    copyDir(iconsSrc, t);
    console.log(`Copied icons -> ${t}`);
  } catch (e) {
    console.warn(`Copy failed for ${t}:`, e?.message || e);
  }
}

// 将 .output/chrome-mv3 整体复制到 dist/chrome-mv3，便于在 Finder 中选择加载
try {
  const from = path.join(process.cwd(), ".output", "chrome-mv3");
  const to = path.join(process.cwd(), "dist", "chrome-mv3");
  copyDir(from, to);
  console.log(`Copied extension build -> ${to}`);
} catch (e) {
  console.warn(`Copy build to dist failed:`, e?.message || e);
}
