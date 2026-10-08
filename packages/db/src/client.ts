// One Postgres connection pool per process (survives Next.js hot reloads in development).
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '@truecut/config';
import * as schema from './schema';

const g = globalThis as any;
export function databaseUrl() {
  const url = env('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL is not set. Point it at Postgres (see docs/DEVELOPMENT.md).');
  return url;
}
export function sql() {
  if (!g.__tcSql) g.__tcSql = postgres(databaseUrl(), { max: Number(env('TRUECUT_DB_POOL', '10')), onnotice: () => {} });
  return g.__tcSql as ReturnType<typeof postgres>;
}
export function db() {
  if (!g.__tcDb) g.__tcDb = drizzle(sql(), { schema });
  return g.__tcDb as ReturnType<typeof drizzle<typeof schema>>;
}
export async function closeDb() { if (g.__tcSql) { await g.__tcSql.end({ timeout: 5 }); g.__tcSql = undefined; g.__tcDb = undefined; } }
