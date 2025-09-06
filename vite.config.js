// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 配信時のみサブパスにする
const isProd = process.env.GITHUB_ACTIONS || process.env.NODE_ENV === 'production'

export default defineConfig({
  plugins: [react()],
  base: isProd ? '/Travel_Web_app/' : '/',
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
