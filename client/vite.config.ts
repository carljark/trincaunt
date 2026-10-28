import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA instalable en Android e iOS. Los PNG de public/icons salen de public/logo.svg y de
    // icons-src/maskable.svg (sin esquinas, con margen de zona segura), p. ej.:
    //   rsvg-convert -w 512 -h 512 icons-src/maskable.svg -o public/icons/maskable-512x512.png
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'icons/apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Trincaunt',
        short_name: 'Trincaunt',
        description: 'Gastos compartidos en grupo',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#4361ee',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Solo se cachea la app (JS, CSS, iconos); los datos siempre van a la red
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//]
      }
    })
  ],
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
