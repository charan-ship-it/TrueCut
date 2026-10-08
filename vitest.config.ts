import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
// Tests never touch real projects: each run gets a throwaway data folder and its own database
// (see tools/test/global-setup.ts).
const dataDir = path.join(os.tmpdir(), `truecut-test-${process.pid}`);
const dbUrl = process.env.TRUECUT_TEST_DATABASE_URL || 'postgresql://truecut:truecut@localhost:5432/truecut_test';
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    globalSetup: ['tools/test/global-setup.ts'],
    testTimeout: 120000,
    fileParallelism: false,
    env: { TRUECUT_DATA: dataDir, DATABASE_URL: dbUrl, TRUECUT_QUEUE: 'inline' },
  },
});
