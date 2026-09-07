import path from 'node:path';
import { startVitest } from '../node_modules/vitest/dist/node.js';

const root = path.resolve('.');
const contexts = await startVitest('test', ['src/main/db/connection.preMigrationBackup.test.ts'], {
  config: false,
  root,
  environment: 'node',
  setupFiles: [],
  watch: false,
  run: true,
});
if (!contexts) process.exitCode = 1;
