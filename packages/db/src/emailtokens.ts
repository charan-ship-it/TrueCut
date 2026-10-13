// Sign-in links: a random token is emailed, its hash is stored, and using it deletes the row in the same
// statement, so a link works once even if two tabs (or a mail scanner and the person) race for it.
import crypto from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from './client';
import { emailTokens } from './schema';
import { sha256 } from './secrets';

export const EMAIL_TOKEN_MINUTES = 30;
/** At most this many unused links per address at once; older ones are dropped. */
const MAX_OPEN = 3;

const norm = (email: string) => email.trim().toLowerCase();

export async function createEmailToken(email: string, minutes = EMAIL_TOKEN_MINUTES) {
  const e = norm(email);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await db().transaction(async (tx) => {
    await tx.delete(emailTokens).where(lt(emailTokens.expiresAt, new Date()));
    // keep only the newest MAX_OPEN - 1 so this one makes MAX_OPEN
    await tx.execute(sql`delete from email_tokens where email = ${e} and token_hash not in (select token_hash from email_tokens where email = ${e} order by created_at desc limit ${MAX_OPEN - 1})`);
    await tx.insert(emailTokens).values({ tokenHash: sha256(token), email: e, expiresAt });
  });
  return { token, expiresAt };
}

/** The address the link was sent to, if the token is valid and unused (it is then used up), else null. */
export async function consumeEmailToken(email: string, token: string): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [r] = await db().delete(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.email, norm(email)), gt(emailTokens.expiresAt, new Date())))
    .returning({ email: emailTokens.email });
  return r?.email || null;
}
