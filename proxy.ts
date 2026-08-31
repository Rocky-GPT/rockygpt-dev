/**
 * @module proxy
 * Refuses to serve from a deployment.
 *
 * (Next 16 renamed this file convention from `middleware` to `proxy`; the
 * behaviour is unchanged.)
 *
 * This remains local-only while the clean-room Brain and its eventual
 * developer contracts are rebuilt. Authentication can be designed when those
 * protected surfaces return.
 */

import { NextResponse } from 'next/server';

export function proxy() {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error: 'rockygpt-dev is not configured for deployment.',
        detail: 'Add authentication before deploying the developer control room.',
      },
      { status: 503 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
