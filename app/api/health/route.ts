/**
 * @module api/health
 * This app's own liveness, checking no dependency on purpose.
 *
 * Whether the brain is reachable is `/operations/health`, and answering that
 * question here would make this endpoint fail for a reason that has nothing to
 * do with whether this process can serve.
 */

import { hasAdminToken } from '@/lib/brain-address';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'healthy',
    service: 'rockygpt-dev',
    // Boolean only. Whether a token exists is the single most likely
    // explanation for an empty Logs page, and it is otherwise invisible.
    adminTokenConfigured: hasAdminToken(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
