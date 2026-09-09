import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import glsl from 'vite-plugin-glsl';
import { createHtmlPlugin } from 'vite-plugin-html';
import json from "./package.json";
import dayjs from "dayjs"

function getGitCommitId(): string {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return "";
  }
}

function isGitDirty(): boolean {
  try {
    return execSync('git status --porcelain').toString().trim().length > 0;
  } catch {
    return false;
  }
}

const GIT_COMMIT_ID = getGitCommitId();
const GIT_COMMIT_DIRTY = isGitDirty();
// bilibili-toy 构建：`vite build --mode bili-toy` → 产物输出到 dist-toy（不覆盖 web 的 dist），
// 并把默认数据包指向 https://lf.gim.ink/<version>/（版本号取构建时 package.json 的 version，非固定）
export default defineConfig(({ command, mode }) => {
  const is_toy_build = mode === 'bili-toy';
  // 开发服务器（vite dev / vite --mode bili-toy）始终走本地数据包，不注入远端 URL
  const is_dev_server = command === 'serve';
  return {
    base: './',
  plugins: [
    react(),
    checker({ typescript: true }),
    createHtmlPlugin({
      inject: {
        data: {
          title: `Little Fighter Wemake v${json.version}`,
          // 仅 bilibili-toy 构建注入 B站 Toy JS SDK script 标签（见 index.html）；
          // 其它环境（普通 web 构建/开发）不加载
          toySdk: is_toy_build
            ? '<script src="//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js"></script>'
            : '',
        }
      }
    }),
    glsl()
  ],
  define: {
    VERSION_NAME: JSON.stringify(json.version),
    GIT_COMMIT_ID: JSON.stringify(GIT_COMMIT_ID),
    GIT_COMMIT_DIRTY: JSON.stringify(GIT_COMMIT_DIRTY ? "dirty" : ""),
    BUILD_TIME: JSON.stringify(dayjs().format(`YYYY-MM-DD HH:mm:ss`)),
    // 构建期注入的默认数据包地址：仅 bilibili-toy 的正式构建（vite build --mode bili-toy）注入远端 URL；
    // 其它构建及 dev 服务器为 undefined，init.ts 回退到同源相对路径（本地 zip）
    DATA_ZIP_URLS: is_toy_build && !is_dev_server
      ? JSON.stringify([
        `https://lf.gim.ink/${json.version}/prel.zip.json`,
        `https://lf.gim.ink/${json.version}/data.zip.json`,
      ])
      : 'undefined',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    watch: {
      ignored: [
        './.vscode/**', './temp/**', './art/**', './docs/**', './lf2s/**',
        './server/**', './scripts/**', './release/**'
      ]
    }
  },

  build: {
    outDir: is_toy_build ? 'dist-toy' : 'dist',
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          if (id.includes('/src/Component/') || id.includes('/src/Utils/') || id.includes('/src/Utils/hooks')) {
            return 'common';
          }
          if (id.includes('/src/Editor/') || id.includes('/src/EditorView/')) {
            return 'editor';
          }
          if (id.includes('/src/LFW/') || id.includes('/src/DittoImpl/') || id.includes('/src/Net/')) {
            return 'lf2-dom'
          }
          if (id.match('/src/pages/')) {
            return 'other-pages'
          }
        },
        chunkFileNames: 'assets/js/[name].[hash].js',
        entryFileNames: 'assets/js/[name].[hash].js',
        assetFileNames: 'assets/[ext]/[name].[hash].[ext]'
      }
    },
    assetsInlineLimit: 16384
  }
  };
});