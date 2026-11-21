import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(), RABBITMQ_URL: z.string().url(),
  JWT_SECRET: z.string().min(64), SETTINGS_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  PRINT_AGENT_TOKEN: z.string().min(32),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  FISCAL_MODE: z.enum(['disabled','sandbox']).default('disabled'),
  PAYMENT_MODE: z.literal('simulated').default('simulated'),
  BUSINESS_TIMEZONE: z.string().default('America/Cuiaba'),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Configuração inválida: ${parsed.error.issues.map(i=>i.path.join('.')).join(', ')}. Execute pnpm dev:env e consulte .env.example.`);
  return parsed.data;
}
