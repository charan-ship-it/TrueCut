import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
// tests never touch real projects: each run gets a throwaway data folder
const dataDir = path.join(os.tmpdir(), `truecut-test-${process.pid}`);
export default defineConfig({ test: { include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'], testTimeout: 120000, env: { TRUECUT_DATA: dataDir } } });
