/** The minimal server-side connection to the clean-room Brain shell. */

import 'server-only';
import { brainAddress } from './brain-address';

const PROBE_TIMEOUT_MS = 5_000;

function targetFor(path: string): string | null {
  const { url } = brainAddress();
  if (url === null) return null;
  return `${url}${path.startsWith('/') ? path : `/${path}`}`;
}

function unavailable(message: string, reason: 'unreachable' | 'misconfigured'): Response {
  return Response.json({ error: message, reason }, { status: 503 });
}

export async function proxyBrainProbe(path: string): Promise<Response> {
  const target = targetFor(path);
  if (target === null) {
    return unavailable('The brain is not configured for this deployment.', 'misconfigured');
  }

  try {
    const upstream = await fetch(target, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return unavailable('The brain is not reachable.', 'unreachable');
  }
}

export interface BrainRead<T> {
  data?: T;
  problem?: string;
}

export async function readBrainProbe<T>(path: '/health' | '/readiness'): Promise<BrainRead<T>> {
  const target = targetFor(path);
  if (target === null) return { problem: 'BRAIN_URL is not set in this environment.' };

  try {
    const response = await fetch(target, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return { problem: `The brain answered HTTP ${response.status}.` };
    return { data: (await response.json()) as T };
  } catch {
    return { problem: 'The brain is not reachable.' };
  }
}
