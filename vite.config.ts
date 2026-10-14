/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built site works from any static host or sub-path.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // Same-origin path to the local relay, so the browser never makes a cross-port request.
    // In the app, set Relay URL to http://localhost:5173/relay (or just /relay).
    proxy: {
      '/relay': {
        target: 'http://localhost:8787',
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/relay/, ''),
        // Same-origin GETs carry no Origin header; the relay's origin check needs one.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (!req.headers.origin && req.headers.host) proxyReq.setHeader('origin', `http://${req.headers.host}`);
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
