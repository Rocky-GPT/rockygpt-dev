import type { ChatMessageInput, ChatRequestBody } from '@/lib/chat-request';
import { factPacketOf, packetSummary } from '../../lib/fact-packet.ts';

/**
 * One asked question and everything that came back.
 *
 * `rawText` and `raw` are both kept. The parsed object is what every panel
 * reads; the bytes are the answer to "what did the wire actually say", which a
 * stringify round-trip does not preserve — number formatting and key order both
 * change. On a turn that went wrong that difference is sometimes the finding.
 */
/** How a turn came out, once it has. `pending` is not one of these. */
export type TurnOutcome = 'ok' | 'declined' | 'not_built' | 'failed';

export const OUTCOMES: ReadonlyArray<{ id: TurnOutcome; label: string }> = [
  { id: 'ok', label: 'Answered' },
  { id: 'declined', label: 'Declined' },
  { id: 'not_built', label: 'Not built yet' },
  { id: 'failed', label: 'Failed' },
];

/**
 * The outcome from the Brain's own answer status, not the HTTP code: a 30-turn run
 * on 09-28 read as 30 "Answered" while the Brain said 18 answered, 4 partial and 8
 * unavailable. `partial` and `clarification` stay `ok`; the raw status still shows
 * beside it.
 */
export function turnOutcome(httpStatus: number, body: unknown): TurnOutcome {
  // The new Brain answers `not_ready` (503) for every route whose step isn't built
  // yet. Nothing broke, and a 50-question run read as all red (09-29).
  if (reasonOf(body) === 'not_ready') return 'not_built';
  if (httpStatus < 200 || httpStatus >= 300) return 'failed';
  const status =
    body && typeof body === 'object' ? (body as Record<string, unknown>).status : undefined;
  return status === 'unavailable' ? 'declined' : 'ok';
}

/**
 * A turn as the current rules read it. A turn keeps the outcome it settled with, so one
 * from before a rule changed (a not-ready turn marked failed, 09-29) would otherwise
 * show the old way until the page reloads.
 */
export function currentOutcome(turn: Turn): Turn {
  if (turn.status === 'pending' || turn.httpStatus === undefined) return turn;
  const status = turnOutcome(turn.httpStatus, turn.raw);
  return status === turn.status ? turn : { ...turn, status };
}

/**
 * What a finished turn adds to a conversation's history. An answered turn adds the
 * question and its answer. A turn the Brain called "not ready" adds the question alone:
 * it was asked, and a follow-up ("what about tomorrow?") leans on it, though there is no
 * answer to add. Leaving it out sent every follow-up on its own, so the Brain read it
 * without the question it followed (09-29). A turn that failed, or hasn't finished,
 * adds nothing.
 */
export function historyOf(turn: Turn): ChatMessageInput[] {
  const status = currentOutcome(turn).status;
  const written = typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined;
  // A Brain that sends facts and no written answer is remembered by what its packet held.
  const packet = factPacketOf(turn.raw);
  const answer = written || (packet ? packetSummary(packet) : undefined);
  if (status === 'not_built') return [{ role: 'user', content: turn.question }];
  if (status === 'failed' || status === 'pending' || !answer) return [];
  return [
    { role: 'user', content: turn.question },
    { role: 'assistant', content: answer },
  ];
}

/** A typed conversation's history: every finished turn but the bulk runner's, which are
 * never replayed as the history of a typed question. */
export function conversationHistory(turns: Turn[]): ChatMessageInput[] {
  return turns.flatMap((turn) => (turn.bulk ? [] : historyOf(turn)));
}

function reasonOf(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const upstream = record.upstreamResponse;
  return (
    record.reason ??
    (upstream && typeof upstream === 'object'
      ? (upstream as Record<string, unknown>).reason
      : undefined)
  );
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
   * `not_built` is the new Brain saying its step for this route isn't built yet.
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
  /** Monotonic browser boundaries; all times are integer microseconds from Send. */
  timing?: {
    totalUs: number;
    preparedUs: number;
    headersUs?: number;
    bodyUs?: number;
    brainTotalUs?: number;
  };
  /** Sent by the bulk runner; never replayed as a typed question's history. */
  bulk?: boolean;
}
