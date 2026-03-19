// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // SSE endpoint needs special handling — Vite's default proxy buffers streaming responses
      '/api/events': {
        target: 'http://localhost:5175',
        // Disable response buffering so SSE chunks flow through immediately
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Force flush by disabling compression/buffering on the proxy response
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      '/api': 'http://localhost:5175',
      '/ws': {
        target: 'http://localhost:5175',
        ws: true,
      },
    },
  },
});