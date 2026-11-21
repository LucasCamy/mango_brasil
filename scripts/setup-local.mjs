import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const target = resolve('.env');
if (existsSync(target)) {
  console.log('.env já existe; nenhuma credencial foi alterada.');
  process.exit(0);
}
const secret = () => randomBytes(32).toString('hex');
const pg = secret(), app = secret(), redis = secret(), rabbit = secret();
const values = {
  NODE_ENV: 'development', PORT: '4000', WEB_ORIGIN: 'http://localhost:5173',
  POSTGRES_DB: 'totem', POSTGRES_USER: 'totem_owner', POSTGRES_PASSWORD: pg,
  APP_DATABASE_PASSWORD: app,
  DATABASE_URL: `postgresql://totem_app:${app}@localhost:54329/totem`,
  MIGRATION_DATABASE_URL: `postgresql://totem_owner:${pg}@localhost:54329/totem`,
  REDIS_PASSWORD: redis, REDIS_URL: `redis://:${redis}@localhost:63799`,
  RABBITMQ_USER: 'totem', RABBITMQ_PASSWORD: rabbit, RABBITMQ_URL: `amqp://totem:${rabbit}@localhost:5673`,
  JWT_SECRET: secret(), SETTINGS_ENCRYPTION_KEY: secret(),
  BOOTSTRAP_EMAIL: 'owner@example.test', BOOTSTRAP_PASSWORD: secret(), BOOTSTRAP_PIN: String(randomInt(100000, 999999)),
  TERMINAL_ID: 'TOTEM-01', TERMINAL_TOKEN: secret(), PRINT_AGENT_TOKEN: secret(),
  FISCAL_MODE: 'disabled', PAYMENT_MODE: 'simulated', ALLOW_DEMO_SEED: 'true',
  PRINT_TRANSPORT: 'spool', PRINT_TERMINAL_ID:'CAIXA-01', PRINT_SPOOL_DIR: '../../.local/print-spool', PRINTER_HOST: '', PRINTER_PORT: '9100',
  BUSINESS_TIMEZONE: 'America/Cuiaba',
};
mkdirSync('.local', { recursive: true });
writeFileSync(target, Object.entries(values).map(([k,v]) => `${k}=${v}`).join('\n')+'\n', { mode: 0o600, flag: 'wx' });
console.log('.env local criado com segredos aleatórios. Consulte BOOTSTRAP_EMAIL/PASSWORD/PIN no arquivo para entrar.');
