/**
 * The route the new Brain's Jev picked for a turn, from a development Brain's
 * `metrics`: one of the nine routes in Dan's routing table (09-29), where it goes, and
 * the picks Jev put under 0.90 on the way there. The Brain follows every pick, sure or
 * not, so a low-confidence one is shown rather than hidden.
 */

type Json = Record<string, unknown>;

/** Why a development Brain went on without Jev, in words; its `metrics.jev.skipped` code. */
export const JEV_SKIPPED: Record<string, string> = {
  routing_unavailable: 'Jev is not set up on this Brain, or could not be reached',
  routing_timeout: 'Jev ran out of time',
  routing_rate_limited: 'Typesafe said too many calls',
  routing_provider_error: 'Typesafe returned an error',
  routing_invalid_response: "Jev's answers didn't check out",
  routing_usage_unknown: "Typesafe didn't say what the call used",
  routing_model_changed: 'Typesafe answered with another Jev model',
  routing_context_limit: 'The conversation was too long for Jev',
  routing_price_unavailable: 'Jev had no current price',
  budget_exhausted: 'The allowance is spent, so all paid work stopped',
  accounting_unavailable: "The spending ledger couldn't be reached, so all paid work stopped",
  accounting_paused: 'Spending is paused, so all paid work stopped',
  accounting_bound_exceeded: 'Spending is paused, so all paid work stopped',
};

export interface JevRoute {
  /** The Brain's route name, such as `campus_fact`. */
  route: string;
  /** "campus fact → retrieval". */
  label: string;
  /** The picks under 0.90 on the way to the route, least sure first. */
  lowConfidence: Array<{ pick: string; percent: number }>;
}

/** One thing Jev read about the question, in words. */
export interface JevReading {
  label: string;
  answer: string;
  /** How likely Jev put that answer. */
  percent: number;
  low: boolean;
}

/** Everything a development Brain says Jev decided for one turn. */
export interface JevDecision {
  route?: JevRoute;
  /** How sure the route is: the least sure pick on the way to it. */
  routePercent?: number;
  /** Why the turn went on without Jev, in words. */
  skipped?: string;
  readings: JevReading[];
  /** What code did with the picks, in one line. */
  codeDid: string;
  costUsd?: number;
  ms?: number;
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

const GOES_TO: Record<string, string> = {
  exact: 'code',
  campus_fact: 'retrieval',
  document_policy: 'retrieval + GPT',
  general_question: 'GPT',
  complex_reasoning: 'GPT',
  multi_part: 'orchestrator',
  account_action: 'capability limit',
  danger: 'safety path',
  ambiguous: 'clarification',
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

/** The office lookups a development Brain reports, or undefined when it sent none. */
export function brainTrace(raw: Json | undefined): unknown[] | undefined {
  if (Array.isArray(raw?.trace)) return raw.trace;
  const wrapped = record(raw?.upstreamResponse)?.trace;
  return Array.isArray(wrapped) ? wrapped : undefined;
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
  // Without Jev the Brain names only the route; Dan's table says where it goes.
  const goesTo = typeof decided?.goesTo === 'string' ? decided.goesTo : GOES_TO[route];
  const lowConfidence = Object.entries(record(decided?.lowConfidence) ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => a[1] - b[1])
    .map(([pick, sureness]) => ({
      pick: PICK_WORDS[pick] ?? pick.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
      percent: Math.round(sureness * 100),
    }));
  return { route, label: goesTo ? `${words} → ${goesTo}` : words, lowConfidence };
}

// Jev's questions in the order the card lists them, each with its answers in words.
const READINGS: Array<[string, string, Record<string, string>?]> = [
  [
    'work',
    'Kind of work',
    {
      calculate: 'calculate',
      look_up: 'look up a campus fact',
      policy: 'a rule or policy',
      general: 'general question',
      reasoning: 'thinking it through',
      cant_do: "something it can't do",
      unclear: 'unclear',
    },
  ],
  ['needs_earlier', 'Needs earlier messages'],
  ['danger', 'Danger', { none: 'none', danger: 'danger right now', self_harm: 'self-harm' }],
  ['own_account', 'Their own account'],
  ['own_account_only', 'Only their account'],
  ['multi_part', 'Several separate asks'],
  [
    'needs',
    'What answering needs',
    {
      campus_info: 'campus information',
      conversation: 'this conversation',
      own_account: 'their own account',
      private: "someone's private information",
      right_now: 'a live look right now',
      guess: 'a guess',
      outside: 'outside knowledge',
    },
  ],
  [
    'named',
    'Kind of thing named',
    {
      place: 'a place',
      office: 'an office',
      person: 'a person',
      group: 'a club',
      event: 'an event',
      course: 'a course',
      several: 'several things',
      none: 'nothing in particular',
    },
  ],
  ['subject', 'Campus area', { student_life: 'student life', none: 'none' }],
];
const REACH_WORDS: Record<string, string> = {
  supported: 'answerable',
  private: 'private',
  live_only: 'live-only',
  unsupported: 'unsupported',
};
// handlerPath names, and the reading each one's sureness comes from.
const PATH_READINGS: Record<string, string> = {
  danger: 'danger',
  ownAccount: 'own_account',
  multiPart: 'multi_part',
  work: 'work',
};

function reading(answer: Json | undefined): { answer: string; sureness: number } | undefined {
  if (typeof answer?.yes === 'number') {
    const yes = answer.yes >= 0.5;
    return { answer: yes ? 'yes' : 'no', sureness: yes ? answer.yes : 1 - answer.yes };
  }
  if (typeof answer?.choice === 'string' && typeof answer.probability === 'number') {
    return { answer: answer.choice, sureness: answer.probability };
  }
  return undefined;
}

function whatCodeDid(metrics: Json, route: JevRoute | undefined, path: string[]): string {
  const mode = metrics.responseMode;
  const phrase = typeof metrics.dangerPhrase === 'string' ? metrics.dangerPhrase : undefined;
  const steps = path.map((step) => PICK_WORDS[step] ?? step).join(', then ');
  const chose = phrase
    ? `The danger phrases heard ${phrase.replaceAll('_', ' ')}, so code chose the danger route.`
    : route && steps
      ? `Code followed Jev's picks (${steps}) to ${route.label}.`
      : route
        ? `Code chose ${route.label}.`
        : '';
  const ending =
    mode === 'safety_net'
      ? 'Code gave the safety help first, with no GPT.'
      : mode === 'access_limit'
        ? "Code wrote what RockyGPT can't reach, with no GPT."
        : mode === 'not_ready'
          ? `That step isn't built yet, so the Brain said "not ready".`
          : typeof mode === 'string'
            ? `The turn ended as ${mode.replaceAll('_', ' ')}.`
            : '';
  return [chose, ending].filter(Boolean).join(' ');
}

export function readJevDecision(raw: Json | undefined): JevDecision | undefined {
  const metrics = brainMetrics(raw);
  if (!metrics) return undefined;
  const jev = record(metrics.jev);
  const decided = record(jev?.decided);
  const answers = record(jev?.answers) ?? {};
  const route = readJevRoute(raw);
  const skippedCode = typeof jev?.skipped === 'string' ? jev.skipped : undefined;
  const readings: JevReading[] = [];
  for (const [key, label, words] of READINGS) {
    const read = reading(record(answers[key]));
    if (!read) continue;
    let answer = words?.[read.answer] ?? read.answer.replaceAll('_', ' ');
    if (key === 'needs' && typeof decided?.reach === 'string') {
      answer += ` (${REACH_WORDS[decided.reach] ?? decided.reach})`;
    }
    const percent = Math.round(read.sureness * 100);
    readings.push({ label, answer, percent, low: read.sureness < 0.9 });
  }
  const path = Array.isArray(decided?.handlerPath)
    ? decided.handlerPath.filter((step): step is string => typeof step === 'string')
    : [];
  // Exact for picks under 0.90 (the Brain lists them); from Jev's answers otherwise.
  const low = record(decided?.lowConfidence) ?? {};
  const sureness = path.map((step) =>
    typeof low[step] === 'number'
      ? (low[step] as number)
      : (reading(record(answers[PATH_READINGS[step] ?? step]))?.sureness ?? 1)
  );
  const cost = jev?.costNusd;
  return {
    route,
    routePercent: sureness.length ? Math.round(Math.min(...sureness) * 100) : undefined,
    skipped: skippedCode
      ? (JEV_SKIPPED[skippedCode] ?? skippedCode.replaceAll('_', ' '))
      : undefined,
    readings,
    codeDid: whatCodeDid(metrics, route, path),
    costUsd: typeof cost === 'number' ? cost / 1e9 : undefined,
    ms: typeof jev?.elapsedMs === 'number' ? jev.elapsedMs : undefined,
  };
}
