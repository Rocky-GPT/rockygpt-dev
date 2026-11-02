/**
 * @module lib/jev-client
 * One call to Jev (TypeSafe's System One endpoint), the same request the Brain's
 * routing makes (rockygpt-brain `core/provider.py`). Server-side only: the key
 * must never reach the browser.
 */

import { JevError, type AskJev, type JevReply, type JevRequest } from './feedback-tags.ts';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_048_576;
/** Refused key, no credit, rate limited or overloaded: every other row would fail the same way. */
const FATAL_STATUSES = new Set([401, 402, 403, 429, 529]);

export function jevClient(
  apiKey: string,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): AskJev {
  return async (request: JevRequest): Promise<JevReply> => {
    let response: Response;
    try {
      response = await fetchImpl(JEV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new JevError(`Jev did not answer within ${timeoutMs / 1_000} seconds`);
      }
      throw new JevError('Jev could not be reached', true);
    }
    if (!response.ok) {
      throw new JevError(`Jev returned HTTP ${response.status}`, FATAL_STATUSES.has(response.status));
    }
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) throw new JevError('Jev sent too large a response');
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new JevError('Jev sent a response that is not JSON');
    }
    const usage = (raw.usage ?? {}) as Record<string, unknown>;
    const tokens = usage.input_tokens;
    return {
      model: String(raw.model ?? ''),
      answers: raw.answers,
      inputTokens: typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 ? tokens : null,
    };
  };
}
