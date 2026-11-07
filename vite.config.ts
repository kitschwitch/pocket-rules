import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    // Relative base so the build works from any static host path (e.g. GitHub Pages /repo/).
    base: './',
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
                name: 'Pinball Capital – Pocket Rules',
                short_name: 'Pocket Rules',
                description: 'Offline pinball rulesheets',
                theme_color: '#0c1612',
                background_color: '#0c1612',
                display: 'standalone',
                start_url: './',
                icons: [
                    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
                ],
            },
            workbox: {
                // App shell + machine list are precached; per-machine data and images are cached as you view them
                // (or all at once via "Save all for offline").
                globPatterns: ['**/*.{js,css,html,svg}', 'data/index.json'],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.pathname.includes('/data/m/'),
                        handler: 'StaleWhileRevalidate',
                        options: { cacheName: 'machines', expiration: { maxEntries: 2000 } },
                    },
                    {
                        urlPattern: ({ request }) => request.destination === 'image',
                        handler: 'CacheFirst',
                        options: { cacheName: 'images', expiration: { maxEntries: 500 }, cacheableResponse: { statuses: [0, 200] } },
                    },
                ],
            },
        }),
    ],
});
