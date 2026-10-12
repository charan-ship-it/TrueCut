// Re-encrypt saved API keys with the current TRUECUT_ENCRYPTION_KEY.
//   1. set the new key in TRUECUT_ENCRYPTION_KEY and the old one in TRUECUT_ENCRYPTION_KEY_PREVIOUS
//   2. npm run keys:rotate
//   3. once it reports 0 left, remove TRUECUT_ENCRYPTION_KEY_PREVIOUS
import { eq } from 'drizzle-orm';
import { db, closeDb, schema, decryptSecret, encryptSecret, needsRotation, secretsAvailable } from '@truecut/db';

if (!secretsAvailable()) { console.error('TRUECUT_ENCRYPTION_KEY is not set.'); process.exit(1); }
const rows = await db().select().from(schema.apiKeys);
let done = 0, failed = 0;
for (const r of rows) {
  if (!needsRotation(r.secret)) continue;
  try { await db().update(schema.apiKeys).set({ secret: encryptSecret(decryptSecret(r.secret)) }).where(eq(schema.apiKeys.id, r.id)); done++; }
  catch (e: any) { failed++; console.error(`✗ ${r.id} (${r.provider}): ${e.message}`); }
}
console.log(`Re-encrypted ${done} key(s); ${failed} could not be opened (ask their owners to re-enter them); ${rows.length - done - failed} already current.`);
await closeDb();
