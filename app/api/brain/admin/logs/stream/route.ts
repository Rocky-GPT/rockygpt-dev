/**
 * @module api/brain/admin/logs/stream
 * The live log feed, proxied without a timeout.
 *
 * This route deliberately does not use `proxyBrain`. That helper puts
 * `AbortSignal.timeout` on every call, and an abort signal cancels the response
 * *body*, not merely the wait for headers — so applying one to an endpoint that
 * streams forever destroys the stream on a timer.
 *
 * The student app does exactly that, and the bug hides itself: `EventSource`
 * reconnects on its own, so the dashboard goes on looking live while silently
 * dropping any change that lands in the reconnect gap and opening a fresh brain
 * connection once a minute, per viewer, indefinitely. The symptom is a log row
 * that sometimes just does not arrive — which reads as a backend problem.
 *
 * So: no timeout, and `request.signal` forwarded instead, so a closed browser
 * tab propagates upstream and lets the brain's generator exit rather than
 * leaving it writing into nothing.
 */

import { brainUrl } from '@/lib/brain-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  const target = brainUrl('/v1/admin/logs/stream');
  if (target === null) {
    return Response.json(
      { error: 'The brain is not configured for this deployment.', reason: 'misconfigured' },
      { status: 503 }
    );
  }

  const token = process.env.ADMIN_API_TOKEN?.trim();
  if (!token) {
    return Response.json(
      {
        error: 'ADMIN_API_TOKEN is not set, so the log stream cannot be opened.',
        reason: 'misconfigured',
      },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(target, {
      headers: { accept: 'text/event-stream', authorization: `Bearer ${token}` },
      cache: 'no-store',
      // No timeout. See the module comment.
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: `The brain answered ${upstream.status} for the log stream.` },
        { status: upstream.status === 401 ? 401 : 502 }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        // `no-transform` and `x-accel-buffering` together stop an intermediary
        // buffering the stream, which would turn a live view into a batch one
        // without any error to show for it.
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    // An aborted request is the browser leaving, not a failure.
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error('Log stream proxy failed:', error);
    return Response.json({ error: 'The brain is not reachable.', reason: 'unreachable' }, { status: 503 });
  }
}
