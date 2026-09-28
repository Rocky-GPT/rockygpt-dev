/** The server-side HTTP connection to the Brain. */

import 'server-only';
import { brainAddress, type ServiceAddress } from './brain-address';
import { brainFailureBody, type FailureReason } from './brain-failure';

const PROBE_TIMEOUT_MS = 5_000;
const CHAT_TIMEOUT_MS = 60_000;

function targetFor(path: string, address: ServiceAddress = brainAddress()): string | null {
  const { url } = address;
  if (url === null) return null;
  return `${url}${path.startsWith('/') ? path : `/${path}`}`;
}

function failure(
  status: number,
  error: string,
  reason: FailureReason,
  detail: string,
  retryable: boolean,
  extra: Record<string, unknown> = {}
): Response {
  return Response.json({ error, reason, detail, retryable, ...extra }, { status });
}

async function proxyResponse(upstream: Response, operation: string): Promise<Response> {
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const requestId = upstream.headers.get('x-request-id');
  if (upstream.ok) {
    const headers = new Headers({ 'content-type': contentType });
    // `no-transform` keeps Next's gzip from holding a streamed turn's events
    // back until the answer is done.
    for (const name of ['x-request-id', 'cache-control', 'x-accel-buffering']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const rawText = await upstream.text();
  let upstreamResponse: unknown = rawText;
  try {
    upstreamResponse = JSON.parse(rawText) as unknown;
  } catch {
    // Preserve a non-JSON upstream response exactly as text.
  }
  return Response.json(
    brainFailureBody(upstream.status, upstreamResponse, operation),
    {
      status: upstream.status,
      headers: requestId ? { 'x-request-id': requestId } : undefined,
    }
  );
}

function misconfigured(): Response {
  return failure(
    503,
    'The Brain is not configured for this deployment.',
    'misconfigured',
    'Set BRAIN_URL to the Brain service address.',
    false
  );
}

function upstreamFailure(
  error: unknown,
  operation: string,
  timeoutMs = PROBE_TIMEOUT_MS,
  setting = 'BRAIN_URL'
): Response {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return failure(
      504,
      `The Brain did not respond within ${timeoutMs / 1_000} seconds.`,
      'timeout',
      `${operation} exceeded the Dev UI proxy timeout.`,
      true,
      { timeoutMs }
    );
  }

  return failure(
    503,
    'The Dev UI could not connect to the Brain.',
    'unreachable',
    `Check that the Brain is running and that ${setting} points to it.`,
    true
  );
}

export async function proxyBrainProbe(
  path: string,
  timeoutMs = PROBE_TIMEOUT_MS,
  address: ServiceAddress = brainAddress()
): Promise<Response> {
  const target = targetFor(path, address);
  if (target === null) {
    return misconfigured();
  }

  try {
    const upstream = await fetch(target, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });

    return proxyResponse(upstream, `GET ${path}`);
  } catch (error) {
    return upstreamFailure(error, `GET ${path}`, timeoutMs, address.setting);
  }
}

export async function proxyBrainChat(request: Request): Promise<Response> {
  const target = targetFor('/v1/chat');
  if (target === null) {
    return misconfigured();
  }

  try {
    // A caller that asks for events gets the Brain's live steps as they
    // happen; anything else gets one JSON answer at the end.
    const streaming = request.headers.get('accept')?.includes('text/event-stream') ?? false;
    const headers = new Headers({
      accept: streaming ? 'text/event-stream' : 'application/json',
      'content-type': 'application/json',
    });
    const environmentToken = process.env.STAGING_SERVICE_TOKEN?.trim();
    if (environmentToken) headers.set('x-rockygpt-environment-token', environmentToken);
    // A development Brain then adds which Brain answered, the evidence the writer and
    // reviewer were given, and every draft with its verdicts. The student app never
    // asks, and a production Brain ignores it.
    headers.set('x-rockygpt-diagnostics', '1');
    const upstream = await fetch(target, {
      method: 'POST',
      headers,
      body: await request.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });

    return proxyResponse(upstream, 'POST /v1/chat');
  } catch (error) {
    return upstreamFailure(error, 'POST /v1/chat', CHAT_TIMEOUT_MS);
  }
}

export interface BrainRead<T> {
  data?: T;
  problem?: string;
}

export async function readBrainProbe<T>(
  path: '/health' | '/readiness' | '/openapi.json'
): Promise<BrainRead<T>> {
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
