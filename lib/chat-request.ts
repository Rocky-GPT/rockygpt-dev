export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

/** The complete client-owned conversation in chronological order. */
export interface ChatRequestBody {
  messages: ChatMessageInput[];
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

export function buildBody(
  state: ComposerState,
  priorMessages: ChatMessageInput[]
): ChatRequestBody {
  return {
    messages: [...priorMessages, { role: 'user', content: state.message.trim() }],
  };
}
