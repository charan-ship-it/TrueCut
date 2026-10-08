// Vitest global setup: point the suite at a throwaway Postgres database and migrate it from scratch.
// TRUECUT_TEST_DATABASE_URL (default: a local "truecut_test" database). Tests that need the database
// are skipped when it can't be reached, so `npm test` still runs the pure tests on a bare laptop.
import postgres from 'postgres';

export default async function setup() {
  const url = process.env.TRUECUT_TEST_DATABASE_URL || 'postgresql://truecut:truecut@localhost:5432/truecut_test';
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 3 });
  try {
    await sql`select 1`;
  } catch {
    console.warn(`\n[tests] No Postgres at ${url.replace(/\/\/[^@]*@/, '//***@')}; database tests are skipped.\n`);
    await sql.end({ timeout: 1 }).catch(() => {});
    return;
  }
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists drizzle cascade; drop schema if exists pgboss cascade; create schema public;');
  await sql.end();
  process.env.DATABASE_URL = url;
  const { runMigrations } = await import('@truecut/db/migrate');
  await runMigrations();
  const { closeDb } = await import('@truecut/db');
  await closeDb();
}
