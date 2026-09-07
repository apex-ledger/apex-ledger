// The browser build of Apex Ledger: the same renderer screens, entered through src/web/main.tsx,
// which supplies window.api over HTTP instead of Electron's preload. Output goes to dist-web and
// is served by the web server (src/server). Build with: npm run build:web
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'src/web',
  publicDir: path.resolve(__dirname, 'public'),
  base: '/',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  plugins: [react()],
  css: {
    postcss: path.resolve(__dirname),
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
});
