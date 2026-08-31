/** The complete clean-room chat request supported in Step 2. */
export interface ChatRequestBody {
  message: string;
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

export function buildBody(state: ComposerState): ChatRequestBody {
  return { message: state.message.trim() };
}
