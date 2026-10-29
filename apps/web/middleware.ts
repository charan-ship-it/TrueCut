// Every page and API route needs a signed-in AIX Core user, except the health check and the extension API
// (/api/ext/*, which checks its own bearer token). Signed-out visitors go to Core's login and come back.
// The Core access check and the organisation live in lib/auth.ts. With sign-in off (local development) the
// session is never read and everything is open.
import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const e = process.env;
const enabled = () => e.TRUECUT_AUTH !== 'off' && (!!e.CLERK_SECRET_KEY || e.TRUECUT_AUTH === 'required' || !!e.RAILWAY_ENVIRONMENT_ID);
const isPublic = createRouteMatcher(['/api/health', '/api/ext/(.*)']);

const clerk = clerkMiddleware(
  async (a, req) => {
    if (isPublic(req)) return;
    // API calls get a 401 for the app to handle; pages go to Core's login.
    if (req.nextUrl.pathname.startsWith('/api/')) { if (!(await a()).userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 }); return; }
    await a.protect();
  },
  { signInUrl: e.CLERK_SIGN_IN_URL, signUpUrl: e.CLERK_SIGN_UP_URL },
);

export default function middleware(req: NextRequest, ev: any) { return enabled() ? clerk(req, ev) : NextResponse.next(); }

export const config = {
  matcher: ['/((?!_next/|engine/|brand/|icon.svg|apple-icon.png|favicon.ico).*)'],
};
