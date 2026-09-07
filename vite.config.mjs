import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(__dirname, 'src/main/index.ts'),
        vite: {
          root: __dirname,
          resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              external: (id) => id === 'better-sqlite3' || id === 'tesseract.js' || id.startsWith('pdfjs-dist'),
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'src/preload/index.ts'),
        vite: {
          root: __dirname,
          resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
          build: { outDir: path.resolve(__dirname, 'dist-electron/preload') },
        },
      },
      renderer: {},
    }),
    renderer(),
  ],
  root: 'src/renderer',
  publicDir: path.resolve(__dirname, 'public'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
