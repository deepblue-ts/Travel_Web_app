// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages のベースパス（リポ名）
const repoBase = '/Travel_Web_app/'

export default defineConfig({
  plugins: [react()],
  // build 時にだけ効くので、常に設定してOK
  base: repoBase,
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
