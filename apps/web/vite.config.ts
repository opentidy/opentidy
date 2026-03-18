import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // SSE endpoint needs special handling — Vite's default proxy buffers streaming responses
      '/api/events': {
        target: 'http://localhost:5174',
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            // Bypass Vite's response processing — pipe SSE stream directly
            res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
            proxyRes.pipe(res);
          });
        },
      },
      '/api': 'http://localhost:5174',
      '/ws': {
        target: 'http://localhost:5174',
        ws: true,
      },
    },
  },
});
