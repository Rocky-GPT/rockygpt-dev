/**
 * Laptop vs Production: one question asked of the laptop Brain and the production
 * Brain side by side, and, when the websites switch is on, through the laptop's
 * student site and the live site too.
 *
 * This is the page's shared logic, the same checks the workspace's
 * compare-production.py and four-way run make: read each reply (the sites can
 * answer as a server-sent `result` event or as JSON), then compare the status,
 * the data release and the cited links. The wording is shown but not judged,
 * since the writer words the same facts fresh every time.
 */

export type WayId = 'laptop-site' | 'live-site' | 'laptop-brain' | 'production-brain';

export interface Way {
  id: WayId;
  label: string;
  /** Through the student website's /api/chat, or straight to the Brain's /v1/chat. */
  door: 'site' | 'brain';
  /** Answered by the production Brain on Render, which costs production money. */
  production: boolean;
}

export const WAYS: Way[] = [
  { id: 'laptop-brain', label: 'Laptop Brain', door: 'brain', production: false },
  { id: 'production-brain', label: 'Production Brain', door: 'brain', production: true },
  { id: 'laptop-site', label: 'Laptop site', door: 'site', production: false },
  { id: 'live-site', label: 'Live site', door: 'site', production: true },
];

export const WAY_IDS = WAYS.map((way) => way.id);
/** The two Brains, compared by default. */
export const BRAIN_WAYS: WayId[] = ['laptop-brain', 'production-brain'];
/** Dan's 11-02 call: the website columns only when the switch is on. */
export function waysFor(withSites: boolean): WayId[] {
  return withSites ? WAY_IDS : BRAIN_WAYS;
}

export function wayFor(id: WayId): Way {
  return WAYS.find((way) => way.id === id) ?? WAYS[0];
}

export function isWayId(value: unknown): value is WayId {
  return typeof value === 'string' && (WAY_IDS as string[]).includes(value);
}

/**
 * Production's small Render server timed out and missed answers at 8 questions at
 * once (11-02 four-way run), so it gets at most 2 at a time. Both the live site and
 * the production Brain land on that one server.
 */
export const PRODUCTION_AT_ONCE = 2;
/** Roughly what one answer costs in model calls, on either Brain. */
export const COST_PER_ANSWER = 0.004;
/** About how long one question takes when its ways run together: the slowest way. */
export const SECONDS_PER_QUESTION = 25;
export const MAX_QUESTION_LENGTH = 2_000;
export const MAX_BULK_QUESTIONS = 200;

export interface Citation {
  title: string;
  url: string;
}

export interface WayResult {
  way: WayId;
  /** A 200 with answer text. */
  ok: boolean;
  /** The HTTP status, or null when the server could not be reached. */
  http: number | null;
  seconds: number;
  /** The Brain's answer status (answered, partial, not_found, ...). */
  status: string | null;
  answer: string;
  citations: Citation[];
  datasetVersion: string | null;
  requestId: string | null;
  /** What went wrong, in plain words. */
  error: string | null;
  /** The reply body exactly as it came back, for the download. */
  raw: unknown;
  /**
   * The ask failed outside the Brain or site: the dev server did not answer the page, or could
   * not connect. Nothing the Brain said came back, so it is not the Brain's answer.
   */
  notReached?: boolean;
  /** How many times the Repeat Test asked again after a failure outside the Brain. */
  retried?: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The `result` event of a site's server-sent reply: {status, body}. */
export function readEventStream(text: string): { status: number | null; body: unknown } | null {
  for (const frame of text.replace(/\r\n/g, '\n').split('\n\n')) {
    let event = '';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (event !== 'result' || !data.length) continue;
    try {
      const payload = record(JSON.parse(data.join('\n')));
      if (!payload) return null;
      return { status: typeof payload.status === 'number' ? payload.status : null, body: payload.body };
    } catch {
      return null;
    }
  }
  return null;
}

/** False when the reply says asking again will not help (the Brain's allowance is spent). */
export function retryable(result: WayResult): boolean {
  const error = record(record(result.raw)?.error);
  return error?.retryable !== false;
}

function citations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const citation = record(item);
    if (!citation || typeof citation.url !== 'string' || !citation.url) return [];
    const title = typeof citation.title === 'string' && citation.title.trim() ? citation.title.trim() : citation.url;
    return [{ title, url: citation.url }];
  });
}

function errorText(http: number | null, body: Record<string, unknown> | null): string {
  const error = body?.error;
  const nested = record(error);
  const message =
    (typeof nested?.message === 'string' && nested.message) ||
    (typeof error === 'string' && error) ||
    (typeof body?.detail === 'string' && body.detail) ||
    '';
  // A 429 is the site's rate limit, the Brain being busy, or the Brain's monthly allowance
  // running out; each says which in its own message.
  if (http === 429) return message || 'Too many questions at once. Wait a minute and ask again.';
  if (http === 504) return message || 'It took too long to answer.';
  if (http !== null && http >= 500) return message || `The server failed (HTTP ${http}).`;
  if (http !== null && http !== 200) return message || `HTTP ${http}.`;
  return message || 'It came back without an answer.';
}

/** One way's reply, read the same whether it came as JSON or as an event stream. */
export function readReply(
  way: WayId,
  http: number,
  contentType: string,
  text: string,
  seconds: number
): WayResult {
  let status = http;
  let body: unknown;
  if (contentType.includes('text/event-stream')) {
    const result = readEventStream(text);
    if (result) {
      status = result.status ?? http;
      body = result.body;
    }
  } else {
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
  }
  const reply = record(body);
  const answer = typeof reply?.answer === 'string' ? reply.answer.trim() : '';
  const ok = status === 200 && answer.length > 0;
  return {
    way,
    ok,
    http: status,
    seconds: Math.round(seconds * 10) / 10,
    status: typeof reply?.status === 'string' ? reply.status : null,
    answer,
    citations: citations(reply?.citations),
    datasetVersion: typeof reply?.datasetVersion === 'string' ? reply.datasetVersion : null,
    requestId: typeof reply?.requestId === 'string' ? reply.requestId : null,
    error: ok ? null : errorText(status, reply),
    raw: body ?? null,
  };
}

/**
 * A way that never got a reply: unreachable, timed out, or stopped. `notReached` when the
 * failure was outside the Brain or site (the dev server, or the connection to it).
 */
export function failedReply(way: WayId, error: string, seconds: number, notReached = false): WayResult {
  return {
    way,
    ok: false,
    http: null,
    seconds: Math.round(seconds * 10) / 10,
    status: null,
    answer: '',
    citations: [],
    datasetVersion: null,
    requestId: null,
    error,
    raw: null,
    ...(notReached ? { notReached: true } : {}),
  };
}

export function citedUrls(result: WayResult): string[] {
  return [...new Set(result.citations.map((citation) => citation.url))].sort();
}

export type VerdictKind = 'agree' | 'close' | 'differ' | 'failed';

export interface Verdict {
  kind: VerdictKind;
  /** Why, one line each, most telling first. */
  reasons: string[];
}

export const VERDICT_LABELS: Record<VerdictKind, string> = {
  agree: 'Agree',
  close: 'Mostly agree',
  differ: 'Differ',
  failed: "Didn't answer",
};

function spread(results: WayResult[], value: (result: WayResult) => string): string {
  const groups = new Map<string, string[]>();
  for (const result of results) {
    const key = value(result);
    groups.set(key, [...(groups.get(key) ?? []), wayFor(result.way).label]);
  }
  return [...groups].map(([key, labels]) => `${key} on ${labels.join(', ')}`).join('; ');
}

/**
 * The marker over the columns, once every way has replied. Agree: same status, same
 * data release, same links. Mostly agree: same status and release, different links
 * (the writer often cites a different page section for the same fact). Differ: the
 * status or the release differs. Didn't answer: a way failed, so it cannot be compared.
 * Null while a way is still asking, or with fewer than two ways.
 */
export function compareResults(results: (WayResult | undefined)[]): Verdict | null {
  if (results.length < 2 || results.some((result) => !result)) return null;
  const done = results as WayResult[];
  const failed = done.filter((result) => !result.ok);
  if (failed.length) {
    return {
      kind: 'failed',
      reasons: failed.map((result) => `${wayFor(result.way).label}: ${result.error}`),
    };
  }
  const reasons: string[] = [];
  if (new Set(done.map((result) => result.status)).size > 1) {
    reasons.push(`Status: ${spread(done, (result) => result.status ?? 'none')}`);
  }
  if (new Set(done.map((result) => result.datasetVersion)).size > 1) {
    reasons.push(`Data: ${spread(done, (result) => result.datasetVersion ?? 'unknown')}`);
  }
  if (reasons.length) return { kind: 'differ', reasons };

  const links = done.map(citedUrls);
  const everywhere = links[0].filter((url) => links.every((list) => list.includes(url)));
  const all = new Set(links.flat());
  if (all.size === everywhere.length) return { kind: 'agree', reasons: [] };
  return {
    kind: 'close',
    reasons: [`Sources: ${everywhere.length} of ${all.size} links are cited by every way`],
  };
}

/**
 * The questions in a pasted list or an uploaded .txt/.csv: one per line, blank lines
 * and # comments skipped, a leading "1." or "-" and surrounding quotes removed, and a
 * spreadsheet's "question" header dropped.
 */
export function parseQuestions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/^(?:\d+[.)]|[-*•])\s+/, '').trim())
    .map((line) => (/^".*"$/.test(line) ? line.slice(1, -1).replace(/""/g, '"').trim() : line))
    .filter((line, index) => line.length > 0 && line.length <= MAX_QUESTION_LENGTH && !(index === 0 && /^questions?$/i.test(line)))
    .slice(0, MAX_BULK_QUESTIONS);
}

export interface RunEstimate {
  answers: number;
  productionAnswers: number;
  dollars: number;
  productionDollars: number;
  minutes: number;
}

/** Questions run one at a time, each one's ways together, so production gets at most 2 at once. */
export function estimateRun(questions: number, ways: WayId[]): RunEstimate {
  const productionWays = ways.filter((id) => wayFor(id).production).length;
  return {
    answers: questions * ways.length,
    productionAnswers: questions * productionWays,
    dollars: questions * ways.length * COST_PER_ANSWER,
    productionDollars: questions * productionWays * COST_PER_ANSWER,
    minutes: Math.max(1, Math.round((questions * SECONDS_PER_QUESTION) / 60)),
  };
}

export function formatDollars(value: number): string {
  return `$${value.toFixed(value < 0.1 ? 3 : 2)}`;
}
