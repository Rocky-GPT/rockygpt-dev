/**
 * How a Brain refusal is described to the page, shared by the server proxy and
 * the browser. A streamed turn carries its failure inside the last event rather
 * than in the HTTP status, so the browser has to build the same body the proxy
 * builds for a plain JSON refusal.
 */

export type FailureReason =
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

export function reasonForStatus(status: number): FailureReason {
  if (status === 400 || status === 413 || status === 422) return 'invalid_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'brain_error';
  return 'http_error';
}

export function failureMessage(body: unknown, status: number): string {
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

/** The Brain's own error object from a refusal body, when it sent one. */
function brainError(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const error = (body as Record<string, unknown>).error;
  return error && typeof error === 'object' && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : undefined;
}

/**
 * The body the page reads for a Brain refusal, with the Brain's own body kept whole.
 *
 * The Brain's own code, retryability and reset time win over what the HTTP status
 * suggests: a spent monthly budget is a 429 like a rate limit, but it is not worth
 * retrying until it resets, and the page said "rate_limited, retry" (09-28).
 */
export function brainFailureBody(
  status: number,
  upstreamResponse: unknown,
  operation: string
): Record<string, unknown> {
  const own = brainError(upstreamResponse);
  const reason = typeof own?.code === 'string' ? own.code : reasonForStatus(status);
  const retryable =
    typeof own?.retryable === 'boolean'
      ? own.retryable
      : reason === 'timeout' || reason === 'rate_limited' || reason === 'brain_error';
  return {
    error: failureMessage(upstreamResponse, status),
    reason,
    detail: `${operation} was rejected by the Brain with HTTP ${status}.`,
    retryable,
    ...(typeof own?.resetAt === 'string' ? { resetAt: own.resetAt } : {}),
    ...(own?.emergency ? { emergency: own.emergency } : {}),
    upstreamStatus: status,
    upstreamResponse,
  };
}
