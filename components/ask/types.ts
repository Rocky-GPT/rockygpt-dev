import type { ChatRequestBody } from '@/lib/chat-request';
import type { TurnStep } from '@/lib/chat-stream';

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

/**
 * The outcome from the Brain's own answer status, not the HTTP code: a 30-turn run
 * on 09-28 read as 30 "Answered" while the Brain said 18 answered, 4 partial and 8
 * unavailable. `partial` and `clarification` stay `ok`; the raw status still shows
 * beside it.
 */
export function turnOutcome(httpStatus: number, body: unknown): TurnOutcome {
  if (httpStatus < 200 || httpStatus >= 300) return 'failed';
  const status =
    body && typeof body === 'object' ? (body as Record<string, unknown>).status : undefined;
  return status === 'unavailable' ? 'declined' : 'ok';
}

export interface Turn {
  localId: string;
  question: string;
  /** The parsed request plus its exact serialized bytes. */
  request: ChatRequestBody;
  requestText: string;
  /**
   * `declined` is the Brain answering that it can't: status `unavailable`, from a
   * guard or a fact it could not verify. Nothing broken, and its reply is kept.
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
  finishedAt?: number;
  latencyMs?: number;
  /** When the first progress event arrived, counted from when it was sent. */
  firstProgressMs?: number;
  /** Sent by the bulk runner; never replayed as a typed question's history. */
  bulk?: boolean;
  /** The stages the Brain reported while it worked, in order. */
  steps?: TurnStep[];
  /** The answer as drafted, while the Brain checks it. Gone once the turn settles. */
  draft?: string;
  /** The first draft the Brain showed while checking it, kept for the export. */
  draftPreview?: { text: string; atMs: number };
  /** Emergency guidance the Brain sent as soon as it saw danger, before the answer. */
  safety?: { answer: string; atMs: number };
}
