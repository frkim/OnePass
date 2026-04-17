import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const SECONDS_PER_DAY = 60 * 60 * 24;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'OnePass',
        short_name: 'OnePass',
        description: 'Badge scanning & activity tracking',
        theme_color: '#0b5fff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cache API GETs so recent activity data is available offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'onepass-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: SECONDS_PER_DAY },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5248', changeOrigin: true },
      '/health': { target: 'http://localhost:5248', changeOrigin: true },
      '/scalar': { target: 'http://localhost:5248', changeOrigin: true },
      '/swagger': { target: 'http://localhost:5248', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
