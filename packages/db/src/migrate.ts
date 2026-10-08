// Applies pending SQL migrations from packages/db/migrations. Run on every deploy (Railway pre-deploy).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from './client';
import { ensureDefaultWorkspace } from './workspaces';

export async function runMigrations() {
  const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await migrate(db(), { migrationsFolder: folder });
  await ensureDefaultWorkspace();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations().then(async () => { console.log('Database is up to date.'); await closeDb(); }).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
}
