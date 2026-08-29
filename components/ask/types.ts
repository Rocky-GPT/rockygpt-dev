import type { ChatRequestBody } from '@/lib/chat-request';

/**
 * One asked question and everything that came back.
 *
 * `rawText` and `raw` are both kept. The parsed object is what every panel
 * reads; the bytes are the answer to "what did the wire actually say", which a
 * stringify round-trip does not preserve — number formatting and key order both
 * change. On a turn that went wrong that difference is sometimes the finding.
 */
export interface Turn {
  localId: string;
  question: string;
  /** Exactly what was sent, so a turn can be reproduced or diffed. */
  request: ChatRequestBody;
  status: 'pending' | 'ok' | 'failed';
  httpStatus?: number;
  rawText?: string;
  raw?: Record<string, unknown>;
  /** From the response header, falling back to the body. Joins to the log row. */
  requestId?: string;
  failure?: string;
  startedAt: number;
  latencyMs?: number;
}
