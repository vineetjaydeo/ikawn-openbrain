import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'markdown': ['react-markdown', 'remark-gfm', 'react-syntax-highlighter'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/capture': 'http://localhost:3000',
      '/search': 'http://localhost:3000',
      '/webhooks': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/brain-health': 'http://localhost:3000',
      '/shared': 'http://localhost:3000',
    },
  },
})
