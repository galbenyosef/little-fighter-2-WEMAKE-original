/**
 * 将 dist 目录的内容打包为 zip（压缩的是 dist 内部的内容，不含 dist 文件夹本身）
 * 用法: node scripts/zip-dist.mjs
 * 输出: release/bilibili-toy-v<version>.zip
 *
 * 过程: 先把 dist 复制到系统临时目录，所有调整都作用于副本，**不修改 dist**。
 *   1. 移除 favicon.ico 与 lfw.full.zip
 *   2. 将 extension/icon256.png 复制为 icon256.png
 *   3. 替换 index.html 中 favicon.ico 的引用为 icon256.png
 *   4. 压缩副本内容后清理临时目录
 */

import { zip } from 'compressing';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST_DIR = join(ROOT, 'dist');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

if (!existsSync(DIST_DIR)) {
  console.error(`[zip-dist] 错误: 找不到 ${DIST_DIR}，请先执行 npm run build`);
  process.exit(1);
}

// 1. 复制 dist 到临时目录，后续改动全部作用于副本，不影响 dist
const STAGE_DIR = mkdtempSync(join(tmpdir(), 'bilibili-toy-'));
console.log(`[zip-dist] 复制 dist 到临时目录 ${STAGE_DIR}`);
cpSync(DIST_DIR, STAGE_DIR, { recursive: true });

// 2. bilibili Toy 图标调整（作用于副本）
const faviconPath = join(STAGE_DIR, 'favicon.ico');
const icon256Path = join(STAGE_DIR, 'icon256.png');
const srcIcon256 = join(ROOT, 'extension', 'icon256.png');

if (existsSync(faviconPath)) {
  rmSync(faviconPath);
  console.log('[zip-dist] 移除 favicon.ico');
}

const fullZipPath = join(STAGE_DIR, 'lfw.full.zip');
if (existsSync(fullZipPath)) {
  rmSync(fullZipPath);
  console.log('[zip-dist] 移除 lfw.full.zip');
}

if (existsSync(srcIcon256)) {
  copyFileSync(srcIcon256, icon256Path);
  console.log('[zip-dist] 复制 extension/icon256.png -> icon256.png');
} else if (!existsSync(icon256Path)) {
  console.warn('[zip-dist] 警告: 找不到 icon256.png 来源，index.html 的引用将指向缺失文件');
}

const htmlPath = join(STAGE_DIR, 'index.html');
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf-8');
  const next = html.split('href="favicon.ico"').join('href="icon256.png"');
  if (next !== html) {
    writeFileSync(htmlPath, next);
    console.log('[zip-dist] index.html: favicon.ico 引用 -> icon256.png');
  }
}

// 3. 压缩副本内容
const OUT_ZIP = join(ROOT, 'release', `bilibili-toy-v${pkg.version}.zip`);
mkdirSync(dirname(OUT_ZIP), { recursive: true });

console.log(`[zip-dist] 压缩 ${DIST_DIR} 内容 -> ${OUT_ZIP}`);
// ignoreBase: true 使副本内的文件/目录直接位于 zip 根目录
await zip.compressDir(STAGE_DIR, OUT_ZIP, { ignoreBase: true });

// 4. 清理临时目录
rmSync(STAGE_DIR, { recursive: true, force: true });
console.log(`[zip-dist] ✅ 完成: ${OUT_ZIP}（dist 未被修改）`);
