/**
 * @module lib/brain-proxy
 * The only way this app reaches the brain.
 *
 * The brain installs no CORS middleware and exposes no OpenAPI document, so the
 * browser cannot call it directly and there is no generated client. Every read
 * goes through a route handler that calls this.
 *
 * Adapted from the student UI's `lib/service-proxy`, with the data-service half
 * deleted rather than left unused: a dead `proxyData` sitting here would invite
 * someone to reach for it, and the campus data service is retired.
 */

import 'server-only';
import { brainAddress, brainTimeoutMs } from './brain-address';

/**
 * Response headers worth forwarding.
 *
 * `etag` and `cache-control` are what make the log dashboard's 304 path work.
 * `x-request-id` is the join key between a turn inspected here and the row it
 * became in the admin log — drop it and "find this turn again later" stops
 * being possible.
 */
const RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'etag',
  'last-modified',
  'retry-after',
  'x-request-id',
  'x-rockygpt-release',
  'x-rockygpt-data-source',
];

/** Statuses whose responses must carry no body at all. */
const BODILESS = new Set([204, 205, 304]);

function forwardedHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/**
 * A refusal the caller can tell apart from data.
 *
 * `reason` exists because the browser could not tell the difference: an unset
 * address and a service that is down both arrived as the same 503 sentence.
 */
function unavailable(message: string, reason: 'unreachable' | 'misconfigured'): Response {
  return Response.json({ error: message, reason }, { status: 503 });
}

export interface ProxyOptions {
  /** Send the admin bearer token. Required for /v1/admin/*. */
  admin?: boolean;
  /** Extra request headers, e.g. the dev origin stamp on a chat turn. */
  headers?: Record<string, string>;
}

/**
 * Proxies one request to the brain.
 *
 * Deliberately not used for the log stream. `AbortSignal.timeout` aborts the
 * response *body*, not just the headers, so putting a timeout on an infinite
 * SSE response destroys the stream on schedule — a bug that hides itself,
 * because EventSource reconnects silently and the dashboard goes on looking
 * live while dropping every change that lands in the gap.
 */
export async function proxyBrain(
  request: Request,
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const { url, problem } = brainAddress();
  if (url === null) {
    console.error(`The brain is not configured: ${problem}`);
    return unavailable('The brain is not configured for this deployment.', 'misconfigured');
  }

  const headers = new Headers({ accept: request.headers.get('accept') || 'application/json' });
  const contentType = request.headers.get('content-type');
  const ifNoneMatch = request.headers.get('if-none-match');
  if (contentType) headers.set('content-type', contentType);
  if (ifNoneMatch) headers.set('if-none-match', ifNoneMatch);
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);

  if (options.admin) {
    const token = process.env.ADMIN_API_TOKEN?.trim();
    if (!token) {
      return Response.json(
        {
          error: 'ADMIN_API_TOKEN is not set, so the brain’s admin routes cannot be reached.',
          reason: 'misconfigured',
        },
        { status: 503 }
      );
    }
    headers.set('authorization', `Bearer ${token}`);
  }

  const target = `${url}${path.startsWith('/') ? path : `/${path}`}`;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(brainTimeoutMs()),
    });

    return new Response(BODILESS.has(upstream.status) ? null : upstream.body, {
      status: upstream.status,
      headers: forwardedHeaders(upstream),
    });
  } catch (error) {
    console.error(`Brain proxy failed for ${target}:`, error);
    return unavailable('The brain is not reachable.', 'unreachable');
  }
}

/** The brain's address plus a path, for handlers that need to read a response. */
export function brainUrl(path: string): string | null {
  const { url } = brainAddress();
  if (url === null) return null;
  return `${url}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface BrainRead<T> {
  data?: T;
  /** What went wrong, phrased so the page can tell a deploy from a restart. */
  problem?: string;
}

/**
 * Reads the brain from a server component.
 *
 * Server components can call the brain directly — they are already on the
 * server, and routing through this app's own handler would be a needless hop.
 * The route handlers exist for the browser, which cannot reach the brain at all
 * because there is no CORS on it.
 */
export async function readBrain<T>(path: string, admin = false): Promise<BrainRead<T>> {
  const target = brainUrl(path);
  if (target === null) return { problem: 'BRAIN_URL is not set in this environment.' };

  const headers = new Headers({ accept: 'application/json' });
  if (admin) {
    const token = process.env.ADMIN_API_TOKEN?.trim();
    if (!token) return { problem: 'ADMIN_API_TOKEN is not set, so admin routes cannot be read.' };
    headers.set('authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(target, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(brainTimeoutMs()),
    });
    if (!response.ok) return { problem: `The brain answered HTTP ${response.status}.` };
    return { data: (await response.json()) as T };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : 'The brain is not reachable.' };
  }
}
