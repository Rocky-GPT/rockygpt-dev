/**
 * @module proxy
 * Refuses to serve from a deployment.
 *
 * (Next 16 renamed this file convention from `middleware` to `proxy`; the
 * behaviour is unchanged.)
 *
 * This app is local-only and has no authentication yet. Pointed at a production
 * `BRAIN_URL` with a production `ADMIN_API_TOKEN` it reads real student chat
 * logs, so "no auth" and "reachable from the internet" must not become true at
 * the same time by accident.
 *
 * The student UI guards its dev pages with `NODE_ENV !== 'development'`, which
 * is worse than it looks: `next build` sets `NODE_ENV=production`
 * unconditionally, so on a deployed instance every guarded page 404s and the
 * app appears broken. The obvious fix — delete the line — silently publishes
 * the logs. This guard fails the other way. A deployment stops, loudly, with an
 * error that says what is missing, and the fix is to build authentication
 * rather than to remove a line.
 *
 * Replace this wholesale when real auth arrives; do not weaken it in place.
 * Note that Next's own guidance is that this layer is for optimistic checks
 * rather than full authorization, so the replacement belongs partly here and
 * partly in the route handlers.
 */

import { NextResponse } from 'next/server';

export function proxy() {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error: 'rockygpt-dev is not configured for deployment.',
        detail:
          'This app reads real student chat logs and has no authentication. ' +
          'Add authentication before deploying it; see proxy.ts.',
      },
      { status: 503 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
