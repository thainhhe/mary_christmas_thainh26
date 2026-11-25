import { defineConfig } from 'vite';

// In dev, forward API calls and the WebSocket to the Node server.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/stats': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
