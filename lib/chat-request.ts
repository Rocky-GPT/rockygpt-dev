/**
 * @module lib/chat-request
 * Building one chat request, safely.
 *
 * The brain's `ChatRequest` is `extra="forbid"`, and its validation handler
 * flattens every field error into a bare `400 "The request is invalid."` with
 * no indication of which field was wrong. So one stray key produces an
 * unactionable refusal — which is why this builds the body from a whitelist
 * rather than spreading a form object, and why the bounds below are checked
 * here rather than discovered upstream.
 *
 * The bounds mirror the brain's contract. They are duplicated deliberately: the
 * point is a message that names the field, which only a local check can give.
 */

export type Role = 'user' | 'assistant';

export interface ChatTurn {
  role: Role;
  content: string;
}

/** Where a turn claims to have come from. The brain records it on the log row. */
export type QuestionOrigin = 'dev' | 'client' | 'bot';

/**
 * How the brain should source the conversation so far.
 *
 * Not a cosmetic choice. `brain.answer` branches on `request.history is not
 * None`, so an empty array and an omitted field mean opposite things — `[]`
 * forces a turn with no memory at all, while omitting it makes the brain replay
 * its own session memory. That gives three genuinely different turns from one
 * question, and the difference between them is usually the bug.
 */
export type MemorySource = 'brain' | 'client' | 'cold';

export interface ComposerState {
  message: string;
  conversationId: string;
  visitorId?: string;
  styleMode?: string;
  responseMode?: string;
  timezone?: string;
  /** Pins the brain's clock, so a time-sensitive answer can be reproduced. */
  now?: string;
  questionOrigin: QuestionOrigin;
  memorySource: MemorySource;
}

export interface ChatRequestBody {
  message: string;
  history?: ChatTurn[];
  styleMode?: string;
  responseMode?: string;
  timezone?: string;
  conversationId?: string;
  visitorId?: string;
  now?: string;
  questionOrigin?: QuestionOrigin;
}

export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_TURN_LENGTH = 2_000;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_OPTION_LENGTH = 32;
const MAX_TIMEZONE_LENGTH = 100;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const OPTION_PATTERN = /^[A-Za-z0-9_-]+$/;

/** A conversation id this app minted, distinguishable in a log. */
export function newConversationId(): string {
  return `dev_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export interface ValidationProblem {
  field: string;
  detail: string;
}

function checkOptional(
  field: string,
  value: string | undefined,
  max: number,
  pattern?: RegExp
): ValidationProblem | undefined {
  if (value === undefined || value === '') return undefined;
  if (value.length > max) return { field, detail: `must be at most ${max} characters` };
  if (pattern && !pattern.test(value)) return { field, detail: 'contains unsupported characters' };
  return undefined;
}

/** Everything wrong with this request, before it costs a round trip. */
export function validate(state: ComposerState): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const message = state.message.trim();
  if (!message) problems.push({ field: 'message', detail: 'is required' });
  else if (message.length > MAX_MESSAGE_LENGTH) {
    problems.push({ field: 'message', detail: `must be at most ${MAX_MESSAGE_LENGTH} characters` });
  }

  for (const problem of [
    checkOptional('conversationId', state.conversationId, MAX_IDENTIFIER_LENGTH, IDENTIFIER_PATTERN),
    checkOptional('visitorId', state.visitorId, MAX_IDENTIFIER_LENGTH, IDENTIFIER_PATTERN),
    checkOptional('styleMode', state.styleMode, MAX_OPTION_LENGTH, OPTION_PATTERN),
    checkOptional('responseMode', state.responseMode, MAX_OPTION_LENGTH, OPTION_PATTERN),
    checkOptional('timezone', state.timezone, MAX_TIMEZONE_LENGTH),
  ]) {
    if (problem) problems.push(problem);
  }

  if (state.now && Number.isNaN(Date.parse(state.now))) {
    problems.push({ field: 'now', detail: 'must be an ISO 8601 instant' });
  }

  return problems;
}

/**
 * Earlier turns, newest-first then reversed, bounded on both count and length.
 *
 * Adapted from the student app's `buildRequestHistory`. Failed turns are
 * skipped rather than sent as blanks: a turn the brain refused is not part of
 * the conversation it would have had.
 */
export function buildHistory(
  turns: ReadonlyArray<{ question: string; answer?: string; ok: boolean }>
): ChatTurn[] {
  const collected: ChatTurn[] = [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn.ok || !turn.answer?.trim()) continue;
    if (collected.length + 2 > MAX_HISTORY_MESSAGES) break;
    collected.push({ role: 'assistant', content: turn.answer.slice(0, MAX_HISTORY_TURN_LENGTH) });
    collected.push({ role: 'user', content: turn.question.slice(0, MAX_HISTORY_TURN_LENGTH) });
  }
  return collected.reverse();
}

/**
 * The request body, built by whitelist.
 *
 * Every key here is one the brain accepts. Nothing else can reach it, because
 * anything else would be refused without saying why.
 */
export function buildBody(state: ComposerState, history: ChatTurn[]): ChatRequestBody {
  const body: ChatRequestBody = {
    message: state.message.trim(),
    questionOrigin: state.questionOrigin,
  };
  // Omitted rather than sent blank: the brain falls back to the visitor id and
  // then the request id, and an empty string would fail its identifier pattern.
  if (state.conversationId) body.conversationId = state.conversationId;

  // The three-way control. `client` sends what you assembled, `cold` sends an
  // empty array to suppress memory outright, and `brain` omits the field so the
  // brain replays its own — which is what a real student gets.
  if (state.memorySource === 'client') body.history = history;
  else if (state.memorySource === 'cold') body.history = [];

  if (state.visitorId) body.visitorId = state.visitorId;
  if (state.styleMode) body.styleMode = state.styleMode;
  if (state.responseMode) body.responseMode = state.responseMode;
  if (state.timezone) body.timezone = state.timezone;
  if (state.now) body.now = new Date(state.now).toISOString();

  return body;
}

/**
 * What went wrong, said plainly.
 *
 * Deliberately unlike the student app's version, which rewords a 503 into
 * reassurance. Here the brain's own message, code and request id are the
 * finding — softening them would hide the thing this app exists to show.
 */
export function describeFailure(status: number, rawText: string, requestId?: string): string {
  let detail = rawText.trim();
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { code?: string; message?: string } | string;
    };
    if (typeof parsed.error === 'string') detail = parsed.error;
    else if (parsed.error) {
      detail = [parsed.error.code, parsed.error.message].filter(Boolean).join(' · ');
    }
  } catch {
    // Not JSON. The raw body is more useful than a guess about it.
  }
  const id = requestId ? ` (${requestId})` : '';
  return `HTTP ${status}${id}${detail ? ` — ${detail}` : ''}`;
}
