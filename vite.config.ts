import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5175,
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://192.168.1.129:8888',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'ws://192.168.1.129:8888',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
