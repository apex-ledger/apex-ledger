import { build } from 'vite';
import react from '@vitejs/plugin-react';

// Use an inline config so restricted Windows build agents do not need Vite's
// config bundler to inspect directories above the project workspace.
await build({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
