import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const usarHttps = process.env.HTTPS === 'true' || process.env.VITE_HTTPS === 'true';

export default defineConfig({
  plugins: usarHttps ? [basicSsl()] : [],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    }
  },
  optimizeDeps: {
    include: [
      '@babylonjs/core',
      '@babylonjs/gui',
    ],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 3000,
  }
});
