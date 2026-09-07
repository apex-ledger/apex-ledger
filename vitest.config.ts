import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Two test environments, because this codebase has two very different kinds of test.
 *
 * The domain tests are pure functions and run fastest in plain node. The component tests need a
 * DOM. Splitting them by directory rather than running everything in jsdom keeps the 700-odd
 * domain tests as quick as they are now — jsdom setup costs real time per file.
 */
export default defineConfig({
  resolve: {
    // Keep the short substituted drive used by the Windows sandbox. Resolving it back to the
    // physical path makes Vite walk protected parent folders before it reaches this workspace.
    preserveSymlinks: true,
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
    setupFiles: ['src/renderer/test/setup.ts'],
  },
});
