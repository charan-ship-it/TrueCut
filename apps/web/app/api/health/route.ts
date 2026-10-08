import { NextResponse } from 'next/server';
import { doctor } from '@truecut/core/system/doctor';
export const dynamic = 'force-dynamic';
// Public (the platform's health check calls it); it reports readiness, never secrets.
export async function GET() {
  const r = await doctor({ launch: false }).catch((e) => ({ ok: false, checks: [], error: String(e?.message || e) }));
  return NextResponse.json(r, { status: r.ok ? 200 : 503 });
}
