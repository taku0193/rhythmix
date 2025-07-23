import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // /api/** → backend:8000/api/**
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      // /static/** → backend:8000/static/**
      '/static': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    }
  }
})
