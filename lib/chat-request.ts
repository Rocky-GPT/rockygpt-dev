export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What POST /v1/chat is sent: the most recent part of the conversation, oldest
 * first and ending with the new question, and how many earlier messages were left
 * out. Not the whole conversation once it outgrows the window below; the Brain is
 * told so, because on 09-29 a request that had silently lost Q4–Q6 let the writer
 * and reviewer approve "I didn't give you a departure time".
 */
export interface ChatRequestBody {
  messages: ChatMessageInput[];
  /**
   * Earlier conversation messages this app did not send. Present only when above
   * zero: an older Brain rejects unknown keys with 422.
   */
  omittedMessages?: number;
}

export interface ComposerState {
  message: string;
}

export interface ValidationProblem {
  field: string;
  detail: string;
}

export function validate(state: ComposerState): ValidationProblem[] {
  return state.message.trim() ? [] : [{ field: 'message', detail: 'is required' }];
}

/**
 * The window mirrors the student app's (09-29): up to 80 messages counting the new
 * question (the Brain's own limit), 24,000 characters (half the Brain's 48,000), and
 * a serialized size under the Brain's 64 KB body cap, since multibyte text can pass
 * the character budget and still be refused (client audit C03). The old 40-message
 * window dropped Q4–Q6 of a 30-turn run at only 5,229 characters. Messages are never
 * clipped here, only left out whole, oldest first.
 */
export const HISTORY_MESSAGES = 80;
export const HISTORY_CHARACTERS = 24_000;
export const HISTORY_BYTES = 60 * 1024;
/** Room for `,"omittedMessages":N` in the byte budget. */
const OMITTED_FIELD_BYTES = 32;

const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

export interface HistoryWindow {
  messages: ChatMessageInput[];
  /** How many of `history`'s messages, all older than the kept ones, were left out. */
  omittedMessages: number;
}

/** The most recent messages of `history` that fit alongside `nextMessage`. */
export function windowHistory(history: ChatMessageInput[], nextMessage: string): HistoryWindow {
  const next = nextMessage.trim();
  const kept: ChatMessageInput[] = [];
  let characters = HISTORY_CHARACTERS - next.length;
  let size =
    HISTORY_BYTES - bytes({ messages: [{ role: 'user', content: next }] }) - OMITTED_FIELD_BYTES;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    // One comma joins it to the array.
    const cost = bytes(message) + 1;
    if (
      kept.length >= HISTORY_MESSAGES - 1 ||
      message.content.length > characters ||
      cost > size
    ) {
      break;
    }
    kept.unshift(message);
    characters -= message.content.length;
    size -= cost;
  }
  // The Brain requires a conversation to open with a question, so a window that
  // starts mid-exchange drops the orphaned answer.
  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();
  return { messages: kept, omittedMessages: history.length - kept.length };
}

export function buildBody(
  state: ComposerState,
  priorMessages: ChatMessageInput[],
  omittedMessages = 0
): ChatRequestBody {
  return {
    messages: [...priorMessages, { role: 'user', content: state.message.trim() }],
    ...(omittedMessages > 0 ? { omittedMessages } : {}),
  };
}

/** Whether a 422 is an older Brain refusing omittedMessages as an unknown field. */
export function refusesOmittedMessages(body: string): boolean {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    return (
      Array.isArray(detail) &&
      detail.some(
        (item) =>
          !!item &&
          typeof item === 'object' &&
          (item as { type?: unknown }).type === 'extra_forbidden' &&
          Array.isArray((item as { loc?: unknown }).loc) &&
          ((item as { loc: unknown[] }).loc.at(-1) === 'omittedMessages')
      )
    );
  } catch {
    return false;
  }
}

/** The same request without omittedMessages, or null if it had none to remove. */
export function withoutOmittedMessages(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !('omittedMessages' in parsed)) return null;
    const rest = { ...parsed };
    delete rest.omittedMessages;
    return JSON.stringify(rest);
  } catch {
    return null;
  }
}
