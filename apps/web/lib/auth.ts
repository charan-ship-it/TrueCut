// Sign-in: Google accounts from the team's domain(s), and/or a one-time link emailed to the address
// (through Nylas, see lib/mailer.ts). Sessions are signed JWT cookies (no session table); every sign-in
// upserts the user into the team workspace, so both ways land on the same account.
//
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   OAuth client (Google Cloud console → Credentials)
//   NYLAS_API_KEY + NYLAS_SEND_DOMAIN or NYLAS_GRANT_ID   turns on email links (see lib/mailer.ts)
//   NEXTAUTH_SECRET                           random string that signs the session cookie
//   NEXTAUTH_URL                              the public URL, e.g. https://truecut.up.railway.app
//   ALLOWED_EMAIL_DOMAINS                     e.g. aixccelerate.com (comma-separated)
//   ALLOWED_EMAILS                            extra individual addresses (optional)
//
// On your own machine without GOOGLE_CLIENT_ID, sign-in is off and everyone is the "Local" user.
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { env, loadEnv } from '@truecut/config';
import { consumeEmailToken, upsertUser, isMember, projectMeta, memberRole, userForToken, isInvited, memberStatus, getUserByEmail, DEFAULT_WORKSPACE_ID, type SessionUser } from '@truecut/db';

loadEnv();

const list = (v: string) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
/** Sign-in is on when Google is configured, on Railway, or in the Docker image (TRUECUT_AUTH=required),
 *  even before Google is set up (then nobody gets in). TRUECUT_AUTH=off turns it off. */
export const authEnabled = () => env('TRUECUT_AUTH') !== 'off' && (!!env('GOOGLE_CLIENT_ID') || env('TRUECUT_AUTH') === 'required' || !!env('RAILWAY_ENVIRONMENT_ID'));

/** The server's allowlist (domains and addresses set in the environment). */
export function emailAllowedByEnv(email?: string | null) {
  if (!email) return false;
  const e = email.toLowerCase(); const domains = list(env('ALLOWED_EMAIL_DOMAINS')); const emails = list(env('ALLOWED_EMAILS'));
  return emails.includes(e) || domains.includes(e.split('@')[1] || '');
}
/** May this address sign in: on the server's allowlist, or invited by an owner from Settings → Team. Fails closed. */
export async function emailAllowed(email?: string | null) {
  if (!email) return false;
  if (emailAllowedByEnv(email)) return true;
  return isInvited(email).catch(() => false);
}

export const authOptions: NextAuthOptions = {
  secret: env('NEXTAUTH_SECRET') || env('AUTH_SECRET') || undefined,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  pages: { signIn: '/signin', error: '/signin' },
  providers: [
    ...(env('GOOGLE_CLIENT_ID') ? [GoogleProvider({
      clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET'),
      authorization: { params: { prompt: 'select_account', ...(list(env('ALLOWED_EMAIL_DOMAINS')).length === 1 ? { hd: list(env('ALLOWED_EMAIL_DOMAINS'))[0] } : {}) } },
    })] : []),
    // The emailed link opens /signin/verify, which posts the token here. Using it deletes it.
    CredentialsProvider({
      id: 'email-link', name: 'Email link',
      credentials: { email: { type: 'email' }, token: { type: 'text' } },
      async authorize(c) {
        return verifyEmailLink(c?.email, c?.token);
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, user }) {
      const verified = (profile as any)?.email_verified !== false;
      const email = user?.email || profile?.email;
      if (!verified || !(await emailAllowed(email))) return false;
      const known = email ? await getUserByEmail(email).catch(() => null) : null;
      if (known && (await memberStatus(known.id).catch(() => ({ disabled: false }))).disabled) return false; // switched off in Settings → Team
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) { const u = await upsertUser({ email: user.email, name: user.name, image: user.image }); token.uid = u.id; token.ws = DEFAULT_WORKSPACE_ID; token.name = u.name; token.picture = u.image; }
      return token;
    },
    async session({ session, token }) {
      (session as any).user = { ...(session.user || {}), id: token.uid, workspaceId: token.ws };
      return session;
    },
  },
};

/** The user for a valid, unused sign-in link (the link is used up), else null. */
export async function verifyEmailLink(email?: string | null, token?: string | null) {
  if (!email || !token || !(await emailAllowed(email))) return null;
  const owner = await consumeEmailToken(email, token);
  return owner ? { id: owner, email: owner, name: null, image: null } : null;
}

const LOCAL: SessionUser & { workspaceId: string } = { id: '', email: 'local@truecut', name: 'Local', image: null, workspaceId: DEFAULT_WORKSPACE_ID };

/** The signed-in user, or null. With sign-in off, the local user. */
export async function currentUser(): Promise<(SessionUser & { workspaceId: string }) | null> {
  if (!authEnabled()) return LOCAL;
  const s: any = await getServerSession(authOptions);
  if (!s?.user?.id) return null;
  const ws = s.user.workspaceId || DEFAULT_WORKSPACE_ID;
  if ((await memberStatus(s.user.id, ws).catch(() => ({ disabled: false }))).disabled) return null; // switched off by an owner (Settings → Team)
  return { id: s.user.id, email: s.user.email, name: s.user.name || '', image: s.user.image || null, workspaceId: ws };
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  return u;
}

/** The user, after checking they can open this project (same workspace). */
export async function requireProject(projectId: string) {
  const u = await requireUser();
  const meta = await projectMeta(projectId);
  if (!meta) throw new HttpError(404, 'Project not found');
  if (authEnabled() && !(await isMember(u.id, meta.workspaceId))) throw new HttpError(404, 'Project not found');
  return u;
}

/** owner | member. With sign-in off (a laptop), the local user runs everything. */
export async function roleOf(u: { id: string; workspaceId: string }) {
  if (!authEnabled() || !u.id) return 'owner';
  return (await memberRole(u.workspaceId, u.id)) || 'member';
}
export async function requireOwner(u: { id: string; workspaceId: string }) {
  if ((await roleOf(u)) !== 'owner') throw new HttpError(403, 'Only a workspace owner can change this.');
}

/** A Chrome-extension request: `Authorization: Bearer tc_…` (a personal access token from Settings). */
export async function userFromBearer(req: Request) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(tc_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const u = await userForToken(m[1]);
  // someone whose address is no longer allowed loses token access too
  if (!u) return null;
  if (authEnabled() && (!(await emailAllowed(u.email)) || (await memberStatus(u.id, u.workspaceId).catch(() => ({ disabled: false }))).disabled)) return null;
  return u;
}
