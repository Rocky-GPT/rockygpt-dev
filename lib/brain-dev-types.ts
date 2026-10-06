/**
 * @module lib/brain-dev-types
 * The shapes of the Brain's development-only routes (`GET /v1/dev/runtime`, `/v1/dev/offices`,
 * `/v1/dev/offices/search`). See the Brain's docs/contract.md, "Development routes".
 */

export interface DevPrices {
  model: string;
  input_nusd_per_token: number;
  cached_input_nusd_per_token: number;
  output_nusd_per_token: number;
  valid_until: string;
}

export interface DevLimits {
  turnSeconds: number;
  maxTurnNusd: number;
  maxModelCalls: number;
  maxToolAttempts: number;
  maxLookupResults: number;
  maxAnswerChars: number;
  maxInputBytes: number | null;
  maxOutputTokens: number | null;
  maxMessages: number;
  maxMessageChars: number;
  maxConversationChars: number;
  maxHistoryBytes: number;
}

export interface DevTool {
  name: string;
  description: string;
  /** A JSON Schema. */
  parameters: Record<string, unknown>;
}

export interface DevRuntime {
  environment: string | null;
  model: string | null;
  prices: DevPrices | null;
  /** Nanodollars in a dollar: the unit of every `*_nusd*` and `*Nusd` number. */
  nusdPerDollar: number;
  limits: DevLimits;
  prompt: string;
  modelInputKeys: string[];
  tools: DevTool[];
  parts: Array<{ kind: string; note: string }>;
  fixedTexts: Array<{ id: string; pickedBy: string[]; when: string; text: string }>;
}

export interface DevOffice {
  entityId: string;
  name: string;
  aliases: string[];
}

export interface DevOffices {
  datasetVersion: string;
  identityHash: string;
  truncated: boolean;
  offices: DevOffice[];
}

export interface DevSearch {
  query: string;
  datasetVersion: string;
  identityHash: string;
  truncated: boolean;
  /** What the Brain's own lookup does with this result: answer for one office, ask which, or find none. */
  outcome: 'answers' | 'asks' | 'not_found';
  /** The office a lookup would answer for, when the outcome is `answers`. */
  chosen: string[];
  candidates: Array<{ entityId: string; name: string; match: 'exact' | 'partial' }>;
}
