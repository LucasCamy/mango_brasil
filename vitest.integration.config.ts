import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['apps/central-api/test/**/*.integration.test.ts'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false, maxWorkers: 1 } });
