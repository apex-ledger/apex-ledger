import { buildApp } from './app.js';
import { createEntraTokenVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { TenantDatabase } from './db.js';
import{HttpEmailSender}from'./email.js';

const config = loadConfig();
const database = new TenantDatabase({
  connectionString: config.DATABASE_URL,
  poolMax: config.DATABASE_POOL_MAX,
  queryTimeoutMs: config.DATABASE_QUERY_TIMEOUT_MS,
});
const app = buildApp({ config, verifyToken: createEntraTokenVerifier(config), database,emailSender:new HttpEmailSender(config) });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await database.close();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  await database.close();
  process.exitCode = 1;
}
