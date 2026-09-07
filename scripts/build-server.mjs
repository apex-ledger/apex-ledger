// Bundles the web server (src/server) with the main-process handlers into dist-server/index.js.
// `electron` is aliased to the stub so the handlers run under plain Node; the native and
// worker-based packages stay external and are loaded from node_modules at run time.
//
//   node scripts/build-server.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'dist-server');
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'server', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: path.join(outDir, 'index.js'),
  sourcemap: true,
  alias: {
    electron: path.join(root, 'src', 'server', 'electronStub.ts'),
    '@shared': path.join(root, 'src', 'shared'),
  },
  external: ['better-sqlite3', '@huggingface/transformers', 'tesseract.js', 'pdfjs-dist', 'pdfjs-dist/*', 'sharp', 'onnxruntime-node', 'express', 'jimp', 'pdf-lib', 'fflate', 'pngjs', 'kysely', 'zod'],
  loader: { '.sql': 'text' },
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});
console.log('server bundle: dist-server/index.js');
