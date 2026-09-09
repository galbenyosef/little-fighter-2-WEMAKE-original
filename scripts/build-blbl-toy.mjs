/**
 * 构建 bilibili-toy 发布包：把构建产物目录（默认 dist；bilibili-toy 构建用 dist-toy）
 * 的内容打包为 zip（压缩的是目录内部的内容，不含目录本身）。
 * 用法: node scripts/build-blbl-toy.mjs [--dir <name>]
 * 输出: release/bilibili-toy-v<version>.zip
 *
 * 过程: 先把产物目录复制到系统临时目录，所有调整都作用于副本，**不修改原目录**。
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
// 支持 --dir <name> 指定产物目录（bilibili-toy 构建产物在 dist-toy）；默认 dist
const DIR_ARG = process.argv.indexOf('--dir');
const DIST_NAME = DIR_ARG >= 0 ? process.argv[DIR_ARG + 1] : 'dist';
const DIST_DIR = join(ROOT, DIST_NAME);

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

if (!existsSync(DIST_DIR)) {
  console.error(`[build-blbl-toy] 错误: 找不到 ${DIST_DIR}，请先执行对应的构建命令`);
  process.exit(1);
}

// 1. 复制产物目录到临时目录，后续改动全部作用于副本，不影响原目录
const STAGE_DIR = mkdtempSync(join(tmpdir(), 'bilibili-toy-'));
console.log(`[build-blbl-toy] 复制 ${DIST_NAME} 到临时目录 ${STAGE_DIR}`);
cpSync(DIST_DIR, STAGE_DIR, { recursive: true });

// 2. bilibili Toy 图标调整（作用于副本）
const faviconPath = join(STAGE_DIR, 'favicon.ico');
const icon256Path = join(STAGE_DIR, 'icon256.png');
const srcIcon256 = join(ROOT, 'extension', 'icon256.png');

if (existsSync(faviconPath)) {
  rmSync(faviconPath);
  console.log('[build-blbl-toy] 移除 favicon.ico');
}

const fullZipPath = join(STAGE_DIR, 'lfw.full.zip');
if (existsSync(fullZipPath)) {
  rmSync(fullZipPath);
  console.log('[build-blbl-toy] 移除 lfw.full.zip');
}

if (existsSync(srcIcon256)) {
  copyFileSync(srcIcon256, icon256Path);
  console.log('[build-blbl-toy] 复制 extension/icon256.png -> icon256.png');
} else if (!existsSync(icon256Path)) {
  console.warn('[build-blbl-toy] 警告: 找不到 icon256.png 来源，index.html 的引用将指向缺失文件');
}

const htmlPath = join(STAGE_DIR, 'index.html');
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf-8');
  const next = html.split('href="favicon.ico"').join('href="icon256.png"');
  if (next !== html) {
    writeFileSync(htmlPath, next);
    console.log('[build-blbl-toy] index.html: favicon.ico 引用 -> icon256.png');
  }
}

// 3. 压缩副本内容
const OUT_ZIP = join(ROOT, 'release', `bilibili-toy-v${pkg.version}.zip`);
mkdirSync(dirname(OUT_ZIP), { recursive: true });

console.log(`[build-blbl-toy] 压缩 ${DIST_NAME} 内容 -> ${OUT_ZIP}`);
// ignoreBase: true 使副本内的文件/目录直接位于 zip 根目录
await zip.compressDir(STAGE_DIR, OUT_ZIP, { ignoreBase: true });

// 4. 清理临时目录
rmSync(STAGE_DIR, { recursive: true, force: true });
console.log(`[build-blbl-toy] ✅ 完成: ${OUT_ZIP}（${DIST_NAME} 未被修改）`);
