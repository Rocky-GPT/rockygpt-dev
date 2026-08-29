/**
 * @module api/brain/admin/logs
 * Student chat logs.
 *
 * No NODE_ENV guard. The student app gated this on development, which meant it
 * 404'd on any built instance — the wrong boundary, and the reason these pages
 * moved to their own app. The boundary here is that this app is not deployed;
 * see `proxy.ts`.
 *
 * The query is forwarded whole so `search`, `route`, `origin`, `version` and
 * `limit` stay the brain's business, and `If-None-Match` rides along so the
 * dashboard's 304 path works.
 */

import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyBrain(request, `/v1/admin/logs${query}`, { admin: true });
}
