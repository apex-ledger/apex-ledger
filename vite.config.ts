import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';

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
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'src/shared'),
            },
          },
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/main'),
            rollupOptions: {
              // better-sqlite3: native module, can't be bundled.
              // tesseract.js: its Node worker spawns a worker_thread by an absolute file path
              // computed from its own __dirname at *runtime* (see
              // node_modules/tesseract.js/src/worker/node/defaultOptions.js). Bundling it into
              // this single output file relocates that code, so __dirname no longer points at
              // node_modules/tesseract.js — the computed worker path doesn't exist, the Worker
              // fails to start, and OCR silently returns nothing. Keeping it external as a normal
              // node_modules require preserves the path resolution it depends on.
              // pdfjs-dist: same class of bug — getDocument() dynamically imports
              // 'pdf.worker.mjs' via a path computed *relative to pdfjs-dist's own bundled file*
              // at runtime. Bundled into this output, that file ends up looking for
              // dist-electron/main/pdf.worker.mjs, which was never emitted there — confirmed in
              // the packaged app via the exact error "Setting up fake worker failed: Cannot find
              // module '...dist-electron\main\pdf.worker.mjs'". External keeps it a normal
              // node_modules require, so the worker file sits right where pdfjs-dist expects it
              // relative to its own package directory. Every call site imports the specific
              // 'pdfjs-dist/legacy/build/pdf.mjs' subpath rather than the bare package name, and
              // Rollup's external only matches an exact specifier (not automatically every
              // subpath) — hence the id.startsWith() check below rather than a plain string.
              external: (id) => id === 'better-sqlite3' || id === 'tesseract.js' || id === '@huggingface/transformers' || id.startsWith('pdfjs-dist'),
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'src/preload/index.ts'),
        vite: {
          root: __dirname,
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'src/shared'),
            },
          },
          build: {
            outDir: path.resolve(__dirname, 'dist-electron/preload'),
          },
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
