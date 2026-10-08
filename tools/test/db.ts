// For tests that need Postgres: `describe.skipIf(!dbReady)(...)`.
import postgres from 'postgres';

async function canConnect() {
  const sql = postgres(process.env.DATABASE_URL || '', { max: 1, connect_timeout: 3, onnotice: () => {} });
  try { await sql`select 1 from projects limit 1`; return true; } catch { return false; } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}
export const dbReady = !!process.env.DATABASE_URL && (await canConnect());
