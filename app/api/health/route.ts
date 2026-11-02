/**
 * @module api/health
 * This app's own liveness, checking no dependency on purpose.
 *
 * Whether the brain is reachable is `/operations/health`, and answering that
 * question here would make this endpoint fail for a reason that has nothing to
 * do with whether this process can serve.
 */

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'healthy',
    service: 'rockygpt-dev',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
