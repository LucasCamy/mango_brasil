import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/**/*.test.ts', 'apps/central-api/test/**/*.unit.test.ts'], testTimeout: 15000 } });
