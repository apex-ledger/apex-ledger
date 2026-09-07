import { build } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

const projectRoot = process.cwd();

await build({
  configFile: false,
  resolve: {
    alias: {
      '@shared': path.resolve(projectRoot, 'src/shared'),
      '@renderer': path.resolve(projectRoot, 'src/renderer'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(projectRoot, 'src/main/index.ts'),
        vite: {
          configFile: false,
          root: projectRoot,
          resolve: { alias: { '@shared': path.resolve(projectRoot, 'src/shared') } },
          build: {
            outDir: path.resolve(projectRoot, 'dist-electron/main'),
            rollupOptions: {
              external: (id) => id === 'better-sqlite3' || id === 'tesseract.js' || id.startsWith('pdfjs-dist'),
            },
          },
        },
      },
      preload: {
        input: path.join(projectRoot, 'src/preload/index.ts'),
        vite: {
          configFile: false,
          root: projectRoot,
          resolve: { alias: { '@shared': path.resolve(projectRoot, 'src/shared') } },
          build: { outDir: path.resolve(projectRoot, 'dist-electron/preload') },
        },
      },
      renderer: {},
    }),
    renderer(),
  ],
  root: path.resolve(projectRoot, 'src/renderer'),
  publicDir: path.resolve(projectRoot, 'public'),
  base: './',
  build: {
    outDir: path.resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
});
