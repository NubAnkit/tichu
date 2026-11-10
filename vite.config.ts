import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // online lobbies: forward the WebSocket to the game server (npm run dev:server)
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
