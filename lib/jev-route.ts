/**
 * The route the new Brain's Jev picked for a turn, from a development Brain's
 * `metrics`: one of the nine routes in Dan's routing table (09-29), where it goes, and
 * the picks Jev put under 0.90 on the way there. The Brain follows every pick, sure or
 * not, so a low-confidence one is shown rather than hidden.
 */

type Json = Record<string, unknown>;

export interface JevRoute {
  /** The Brain's route name, such as `campus_fact`. */
  route: string;
  /** "campus fact → retrieval". */
  label: string;
  /** The picks under 0.90 on the way to the route, least sure first. */
  lowConfidence: Array<{ pick: string; percent: number }>;
}

const ROUTE_WORDS: Record<string, string> = {
  exact: 'exact',
  campus_fact: 'campus fact',
  document_policy: 'document/policy',
  general_question: 'general question',
  complex_reasoning: 'complex reasoning',
  multi_part: 'multi-part',
  account_action: 'account action',
  danger: 'danger',
  ambiguous: 'ambiguous',
};

const PICK_WORDS: Record<string, string> = {
  danger: 'danger',
  ownAccount: 'own account',
  multiPart: 'several parts',
  work: 'kind of work',
};

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
}

/** A failed turn keeps the Brain's own body under `upstreamResponse`. */
export function brainMetrics(raw: Json | undefined): Json | undefined {
  return record(raw?.metrics) ?? record(record(raw?.upstreamResponse)?.metrics);
}

export function readJevRoute(raw: Json | undefined): JevRoute | undefined {
  const metrics = brainMetrics(raw);
  const decided = record(record(metrics?.jev)?.decided);
  // Without Jev, the danger phrases still name the danger route.
  const route =
    typeof decided?.handler === 'string'
      ? decided.handler
      : typeof metrics?.handler === 'string'
        ? metrics.handler
        : undefined;
  if (!route) return undefined;
  const words = ROUTE_WORDS[route] ?? route.replaceAll('_', ' ');
  const goesTo = typeof decided?.goesTo === 'string' ? decided.goesTo : undefined;
  const lowConfidence = Object.entries(record(decided?.lowConfidence) ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => a[1] - b[1])
    .map(([pick, sureness]) => ({
      pick: PICK_WORDS[pick] ?? pick.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
      percent: Math.round(sureness * 100),
    }));
  return { route, label: goesTo ? `${words} → ${goesTo}` : words, lowConfidence };
}
