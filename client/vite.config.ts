import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: ['src/styles']
      }
    }
  },
  server: {
    port: 5173,
    allowedHosts: ['carlosalbertogodoy.ddns.net']
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          chart: ['chart.js', 'react-chartjs-2'],
          xlsx: ['xlsx-js-style']
        }
      }
    }
  }
})
