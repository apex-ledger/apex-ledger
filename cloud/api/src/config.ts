import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  APP_VERSION: z.string().min(1).default('development'),
  AZURE_REGION: z.string().min(1).default('local'),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  AUTH_ISSUER: z.string().url(),
  AUTH_AUDIENCE: z.string().min(1),
  AUTH_JWKS_URI: z.string().url(),
  INVITATION_BASE_URL: z.string().url(),
  CONTACT_SEARCH_HMAC_SECRET: z.string().min(32),
  MFA_REQUIRED: z.enum(['true','false']).transform((value)=>value==='true').default(true),
  MFA_HMAC_SECRET: z.string().min(32),
  EMAIL_DELIVERY_URL: z.string().url().optional(),
  EMAIL_DELIVERY_BEARER_TOKEN: z.string().min(20).optional(),
  EMAIL_FROM_ADDRESS: z.string().email(),
  ALLOWED_ORIGINS: z.string().default(''),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(environment);
}
