/** The minimal server-side connection to the clean-room Brain shell. */

import 'server-only';
import { brainAddress } from './brain-address';

const PROBE_TIMEOUT_MS = 5_000;

type FailureReason =
  | 'timeout'
  | 'unreachable'
  | 'misconfigured'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'brain_error'
  | 'http_error';

function targetFor(path: string): string | null {
  const { url } = brainAddress();
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

function reasonForStatus(status: number): FailureReason {
  if (status === 400 || status === 413 || status === 422) return 'invalid_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'brain_error';
  return 'http_error';
}

function failureMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (typeof record.error === 'string') return record.error;
    if (typeof record.detail === 'string') return record.detail;
    if (
      Array.isArray(record.detail) &&
      record.detail[0] &&
      typeof record.detail[0] === 'object' &&
      typeof (record.detail[0] as Record<string, unknown>).msg === 'string'
    ) {
      return (record.detail[0] as Record<string, unknown>).msg as string;
    }
    if (
      record.error &&
      typeof record.error === 'object' &&
      !Array.isArray(record.error) &&
      typeof (record.error as Record<string, unknown>).message === 'string'
    ) {
      return (record.error as Record<string, unknown>).message as string;
    }
  }
  return `The Brain returned HTTP ${status} without a specific error message.`;
}

async function proxyResponse(upstream: Response, operation: string): Promise<Response> {
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const requestId = upstream.headers.get('x-request-id');
  if (upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': contentType,
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
    });
  }

  const rawText = await upstream.text();
  let upstreamResponse: unknown = rawText;
  try {
    upstreamResponse = JSON.parse(rawText) as unknown;
  } catch {
    // Preserve a non-JSON upstream response exactly as text.
  }
  const reason = reasonForStatus(upstream.status);
  return Response.json(
    {
      error: failureMessage(upstreamResponse, upstream.status),
      reason,
      detail: `${operation} was rejected by the Brain with HTTP ${upstream.status}.`,
      retryable: reason === 'timeout' || reason === 'rate_limited' || reason === 'brain_error',
      upstreamStatus: upstream.status,
      upstreamResponse,
    },
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

function upstreamFailure(error: unknown, operation: string): Response {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return failure(
      504,
      `The Brain did not respond within ${PROBE_TIMEOUT_MS / 1_000} seconds.`,
      'timeout',
      `${operation} exceeded the Dev UI proxy timeout.`,
      true,
      { timeoutMs: PROBE_TIMEOUT_MS }
    );
  }

  return failure(
    503,
    'The Dev UI could not connect to the Brain.',
    'unreachable',
    'Check that the Brain is running and that BRAIN_URL points to it.',
    true
  );
}

export async function proxyBrainProbe(path: string): Promise<Response> {
  const target = targetFor(path);
  if (target === null) {
    return misconfigured();
  }

  try {
    const upstream = await fetch(target, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    return proxyResponse(upstream, `GET ${path}`);
  } catch (error) {
    return upstreamFailure(error, `GET ${path}`);
  }
}

export async function proxyBrainChat(request: Request): Promise<Response> {
  const target = targetFor('/v1/chat');
  if (target === null) {
    return misconfigured();
  }

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: await request.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    return proxyResponse(upstream, 'POST /v1/chat');
  } catch (error) {
    return upstreamFailure(error, 'POST /v1/chat');
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
