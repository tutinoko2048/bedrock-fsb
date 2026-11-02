import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  // GitHub Pages などのサブパスに置けるように相対パスで出力する
  base: './',
  resolve: {
    // dist をビルドしなくても済むように、ライブラリはソースを直接読む
    alias: { 'bedrock-fsb': fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
  },
});
