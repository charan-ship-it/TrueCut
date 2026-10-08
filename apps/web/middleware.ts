// Every page and API route needs a signed-in team member, except sign-in itself, the health check
// and static assets. With sign-in off (local development) everything is open.
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const enabled = () => !!process.env.GOOGLE_CLIENT_ID || (process.env.NODE_ENV === 'production' && process.env.TRUECUT_AUTH !== 'off');

export async function middleware(req: NextRequest) {
  if (!enabled()) return NextResponse.next();
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET });
  if (token?.uid) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/signin'; url.search = `?callbackUrl=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/auth|api/health|signin|_next/|engine/|brand/|icon.svg|apple-icon.png|favicon.ico).*)'],
};
