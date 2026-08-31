import type { ChatRequestBody } from '@/lib/chat-request';

/**
 * One asked question and everything that came back.
 *
 * `rawText` and `raw` are both kept. The parsed object is what every panel
 * reads; the bytes are the answer to "what did the wire actually say", which a
 * stringify round-trip does not preserve — number formatting and key order both
 * change. On a turn that went wrong that difference is sometimes the finding.
 */
/** How a turn came out, once it has. `pending` is not one of these. */
export type TurnOutcome = 'ok' | 'declined' | 'failed';

export const OUTCOMES: ReadonlyArray<{ id: TurnOutcome; label: string }> = [
  { id: 'ok', label: 'Answered' },
  { id: 'declined', label: 'Declined' },
  { id: 'failed', label: 'Failed' },
];

export interface Turn {
  localId: string;
  question: string;
  /** The parsed request plus its exact serialized bytes. */
  request: ChatRequestBody;
  requestText: string;
  /**
   * `declined` is a guard refusing on purpose — no answer, nothing broken.
   * `failed` is the system: an unreachable brain, campus data down, a crash.
   */
  status: 'pending' | TurnOutcome;
  httpStatus?: number;
  rawText?: string;
  raw?: Record<string, unknown>;
  /** From the response header, falling back to the body. Joins to the log row. */
  requestId?: string;
  failure?: string;
  startedAt: number;
  latencyMs?: number;
}
