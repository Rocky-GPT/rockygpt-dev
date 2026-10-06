/**
 * @module lib/alias-lookup
 * What the Aliases page says about one office lookup. The Brain decides the outcome with its
 * own rule; this module only turns what it returned into words.
 */
import type { DevSearch } from './brain-dev-types';

export const QUERY_MAX_CHARS = 200;

export type Lookup =
  | { state: 'idle' }
  | { state: 'searching' }
  | { state: 'done'; query: string; result: DevSearch }
  | { state: 'failed'; query: string; problem: string };

/** A result or failure belongs to the text only if it was asked for that exact text. */
export function lookupToShow(lookup: Lookup, query: string): Lookup {
  if (!query) return { state: 'idle' };
  if ((lookup.state === 'done' || lookup.state === 'failed') && lookup.query === query) return lookup;
  return { state: 'searching' };
}

export function lookupProblem(status: number, body: unknown): string {
  if (status === 422) {
    return `The Brain refused this query as invalid. It accepts 1 to ${QUERY_MAX_CHARS} characters.`;
  }
  const error =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  return error ?? `The Brain answered HTTP ${status}.`;
}

export const MATCH_MEANING = {
  exact: 'Exact: the text equals a name or alias, ignoring case and extra spaces.',
  partial:
    'Partial: the text sits inside a name or alias, or all the words of one appear in the other.',
} as const;

/** The sentence for the Brain's own outcome. Says plainly when this Brain did not return one. */
export function outcomeSentence(result: DevSearch): string {
  switch (result.outcome) {
    case 'answers': {
      const names = (result.chosen ?? []).map(
        (id) => result.candidates.find((candidate) => candidate.entityId === id)?.name ?? id
      );
      return names.length > 0
        ? `The lookup would use ${names.join(', ')}.`
        : 'The Brain says the lookup would answer, but it did not name the office.';
    }
    case 'asks':
      return 'Several offices fit, so the Brain asks which one is meant. These are the offices it would ask about.';
    case 'not_found':
      return 'No office matched, so the Brain says it found no matching office.';
    default:
      return 'This Brain did not say what the lookup would do with this result. Restart it on the current code to get that.';
  }
}
