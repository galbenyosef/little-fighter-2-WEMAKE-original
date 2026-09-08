/**
 * 将 dist 目录的内容打包为 zip（压缩的是 dist 内部的内容，不含 dist 文件夹本身）
 * 用法: node scripts/zip-dist.mjs
 * 输出: release/bilibili-toy-v<version>.zip
 *
 * 打包前对 dist 做 bilibili Toy 调整:
 *   1. 移除 favicon.ico
 *   2. 将 extension/icon256.png 复制为 dist/icon256.png
 *   3. 替换 dist/index.html 中 favicon.ico 的引用为 icon256.png
 */

import { zip } from 'compressing';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST_DIR = join(ROOT, 'dist');

// --- bilibili Toy 图标调整（在 dist 上原地进行） ---
const faviconPath = join(DIST_DIR, 'favicon.ico');
const icon256Path = join(DIST_DIR, 'icon256.png');
const srcIcon256 = join(ROOT, 'extension', 'icon256.png');

if (existsSync(faviconPath)) {
  console.log('[zip-dist] 移除 favicon.ico');
  rmSync(faviconPath);
} else {
  console.warn('[zip-dist] 警告: dist 中未找到 favicon.ico');
}

if (existsSync(srcIcon256)) {
  copyFileSync(srcIcon256, icon256Path);
  console.log('[zip-dist] 复制 extension/icon256.png -> dist/icon256.png');
} else if (!existsSync(icon256Path)) {
  console.warn('[zip-dist] 警告: 找不到 icon256.png 来源，index.html 的引用将指向缺失文件');
}

const htmlPath = join(DIST_DIR, 'index.html');
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf-8');
  const next = html.split('href="favicon.ico"').join('href="icon256.png"');
  if (next !== html) {
    writeFileSync(htmlPath, next);
    console.log('[zip-dist] index.html: favicon.ico 引用 -> icon256.png');
  }
} else {
  console.warn('[zip-dist] 警告: dist 中未找到 index.html');
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

if (!existsSync(DIST_DIR)) {
  console.error(`[zip-dist] 错误: 找不到 ${DIST_DIR}，请先执行 npm run build`);
  process.exit(1);
}

const OUT_ZIP = join(ROOT, 'release', `bilibili-toy-v${pkg.version}.zip`);
mkdirSync(dirname(OUT_ZIP), { recursive: true });

console.log(`[zip-dist] 压缩 ${DIST_DIR} -> ${OUT_ZIP}`);
// ignoreBase: true 使 dist 内的文件/目录直接位于 zip 根目录
await zip.compressDir(DIST_DIR, OUT_ZIP, { ignoreBase: true });
console.log(`[zip-dist] ✅ 完成: ${OUT_ZIP}`);
