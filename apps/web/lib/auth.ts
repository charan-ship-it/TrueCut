// Sign-in: Google accounts from the team's domain(s). Sessions are signed JWT cookies (no session table);
// every sign-in upserts the user into the team workspace.
//
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   OAuth client (Google Cloud console → Credentials)
//   NEXTAUTH_SECRET                           random string that signs the session cookie
//   NEXTAUTH_URL                              the public URL, e.g. https://truecut.up.railway.app
//   ALLOWED_EMAIL_DOMAINS                     e.g. aixccelerate.com (comma-separated)
//   ALLOWED_EMAILS                            extra individual addresses (optional)
//
// On your own machine without GOOGLE_CLIENT_ID, sign-in is off and everyone is the "Local" user.
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { env, loadEnv } from '@truecut/config';
import { upsertUser, isMember, projectMeta, DEFAULT_WORKSPACE_ID, type SessionUser } from '@truecut/db';

loadEnv();

const list = (v: string) => v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
/** Sign-in is on when Google is configured, on Railway, or in the Docker image (TRUECUT_AUTH=required),
 *  even before Google is set up (then nobody gets in). TRUECUT_AUTH=off turns it off. */
export const authEnabled = () => env('TRUECUT_AUTH') !== 'off' && (!!env('GOOGLE_CLIENT_ID') || env('TRUECUT_AUTH') === 'required' || !!env('RAILWAY_ENVIRONMENT_ID'));

export function emailAllowed(email?: string | null) {
  if (!email) return false;
  const e = email.toLowerCase(); const domains = list(env('ALLOWED_EMAIL_DOMAINS')); const emails = list(env('ALLOWED_EMAILS'));
  if (!domains.length && !emails.length) return false; // fail closed: nobody gets in until a domain is set
  return emails.includes(e) || domains.includes(e.split('@')[1] || '');
}

export const authOptions: NextAuthOptions = {
  secret: env('NEXTAUTH_SECRET') || env('AUTH_SECRET') || undefined,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  pages: { signIn: '/signin', error: '/signin' },
  providers: env('GOOGLE_CLIENT_ID') ? [GoogleProvider({
    clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET'),
    authorization: { params: { prompt: 'select_account', ...(list(env('ALLOWED_EMAIL_DOMAINS')).length === 1 ? { hd: list(env('ALLOWED_EMAIL_DOMAINS'))[0] } : {}) } },
  })] : [],
  callbacks: {
    async signIn({ profile, user }) {
      const verified = (profile as any)?.email_verified !== false;
      return verified && emailAllowed(user?.email || profile?.email);
    },
    async jwt({ token, user }) {
      if (user?.email) { const u = await upsertUser({ email: user.email, name: user.name, image: user.image }); token.uid = u.id; token.ws = DEFAULT_WORKSPACE_ID; }
      return token;
    },
    async session({ session, token }) {
      (session as any).user = { ...(session.user || {}), id: token.uid, workspaceId: token.ws };
      return session;
    },
  },
};

const LOCAL: SessionUser & { workspaceId: string } = { id: '', email: 'local@truecut', name: 'Local', image: null, workspaceId: DEFAULT_WORKSPACE_ID };

/** The signed-in user, or null. With sign-in off, the local user. */
export async function currentUser(): Promise<(SessionUser & { workspaceId: string }) | null> {
  if (!authEnabled()) return LOCAL;
  const s: any = await getServerSession(authOptions);
  if (!s?.user?.id) return null;
  return { id: s.user.id, email: s.user.email, name: s.user.name || '', image: s.user.image || null, workspaceId: s.user.workspaceId || DEFAULT_WORKSPACE_ID };
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
