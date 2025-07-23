import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// この設定ファイルに統一し、vite.config.jsは削除してください。
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // /api へのリクエストはバックエンドへプロキシ
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      },
      // static ファイルもプロキシ
      '/static': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket
      '/ws': {
        target: 'ws://backend:8000',
        ws: true,
      },
    },
  },
})
