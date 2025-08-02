// vite.config.js

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // プロキシの設定
    proxy: {
      // '/api' から始まるリクエストをプロキシの対象にする
      '/api': {
        // 転送先のバックエンドサーバー
        target: 'http://localhost:3001',
        // オリジンを偽装する（CORSエラー対策）
        changeOrigin: true,
        // パスを書き換える ('/api/generate-plan' -> '/generate-plan')
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})