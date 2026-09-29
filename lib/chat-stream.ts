/**
 * @module lib/chat-stream
 * Reading a turn while the Brain works on it.
 *
 * Asked with `accept: text/event-stream`, POST /v1/chat answers with Server-Sent
 * Events: `progress` events naming the stage it is in and what it is looking
 * up, a draft of the answer while that draft is being checked, and one `result`
 * event carrying the status and body a plain JSON call would have returned.
 * Sources and tool calls only arrive with that result.
 *
 * Adapted from the student app's `lib/chat-stream`. That one hides topics it
 * does not know, because students read it; this one names them, because an
 * unknown topic is something a developer wants to see.
 */

export interface ProgressSubject {
  topic: string;
  meal?: string;
  date_from?: string;
  date_to?: string;
}

/** One `progress` event, as the Brain's `ProgressUpdate` sends it. */
export interface ProgressUpdate {
  stage: string;
  subjects?: ProgressSubject[];
  operation?: string;
  draft?: string;
}

/** A stage the turn reached, and when, counted from when it was sent. */
export interface TurnStep {
  stage: string;
  subjects: ProgressSubject[];
  operation?: string;
  atMs: number;
}

export interface StreamResult {
  status: number;
  body: unknown;
}

export class ChatStreamError extends Error {
  constructor() {
    super('The connection to the Brain ended before an answer arrived.');
    this.name = 'ChatStreamError';
  }
}

export function isEventStream(response: Response): boolean {
  return response.headers.get('content-type')?.includes('text/event-stream') ?? false;
}

/** Reads events until the `result` event, calling `onProgress` for each step on the way. */
export async function readChatStream(
  response: Response,
  onProgress: (update: ProgressUpdate) => void
): Promise<StreamResult> {
  if (!response.body) throw new ChatStreamError();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let event = '';
        const lines: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
        }
        if (!lines.length || (event !== 'progress' && event !== 'result')) continue;
        const data: unknown = JSON.parse(lines.join('\n'));
        if (!data || typeof data !== 'object') throw new ChatStreamError();
        const payload = data as Record<string, unknown>;
        if (event === 'progress') {
          if (typeof payload.stage === 'string') onProgress(payload as unknown as ProgressUpdate);
        } else {
          if (typeof payload.status !== 'number') throw new ChatStreamError();
          return { status: payload.status, body: payload.body };
        }
      }
      if (done) throw new ChatStreamError();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ChatStreamError();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * The steps so far with this update added. The Brain repeats a stage when it
 * goes round again with nothing new to say, and a second identical line is
 * noise.
 */
export function addStep(steps: TurnStep[], update: ProgressUpdate, atMs: number): TurnStep[] {
  const step: TurnStep = {
    stage: update.stage,
    subjects: Array.isArray(update.subjects) ? update.subjects : [],
    ...(update.operation ? { operation: update.operation } : {}),
    atMs,
  };
  const last = steps[steps.length - 1];
  if (
    last &&
    last.stage === step.stage &&
    last.operation === step.operation &&
    JSON.stringify(last.subjects) === JSON.stringify(step.subjects)
  ) {
    return steps;
  }
  return [...steps, step];
}

const STAGES: Record<string, string> = {
  connecting: 'Connecting to the Brain',
  understanding: 'Understanding the question',
  retrieving: 'Looking up campus data',
  calculating: 'Calculating',
  composing: 'Writing the answer',
  reviewing: 'Checking the answer',
};

const TOPICS: Record<string, string> = {
  documents: 'campus policies and guidance',
  critical_facts: 'published campus facts',
  contacts: 'contact details',
  campus_hours: 'campus hours',
  dining_hours: 'dining hours',
  menu: 'menu',
  calendar: 'academic dates',
  events: 'campus events',
  clubs: 'student organizations',
  programs: 'academic programs',
  program_requirements: 'program requirements',
  courses: 'courses',
  faculty: 'faculty',
  shuttle: 'shuttle schedules',
};

const MEALS: Record<string, string> = {
  breakfast: 'breakfast',
  brunch: 'brunch',
  lunch: 'lunch',
  dinner: 'dinner',
  latenight: 'late-night',
};

const OPERATIONS: Record<string, string> = {
  sum: 'adding values',
  difference: 'finding a difference',
  mean: 'finding an average',
  minimum: 'finding the lowest value',
  maximum: 'finding the highest value',
  sort: 'putting values in order',
  count: 'counting matching records',
  duration: 'time between two times',
  compare_times: 'comparing times',
  departures: 'comparing departures with the requested time',
};

/** `2026-09-27` as `Sep 27`, or an empty string for anything that is not a plain date. */
export function displayDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function describeSubject(subject: ProgressSubject): string {
  let name = TOPICS[subject.topic] ?? subject.topic.replaceAll('_', ' ');
  if (subject.meal) name = `${MEALS[subject.meal] ?? subject.meal} ${name}`;
  const from = displayDate(subject.date_from);
  const to = displayDate(subject.date_to);
  if (from) name += ` · ${from}${to && to !== from ? ` to ${to}` : ''}`;
  return name;
}

/** What a step says on screen: the stage, and what it was working on. */
export function describeStep(step: Pick<TurnStep, 'stage' | 'subjects' | 'operation'>): {
  label: string;
  detail?: string;
} {
  const label = STAGES[step.stage] ?? step.stage.replaceAll('_', ' ');
  if (step.stage === 'calculating' && step.operation) {
    return { label, detail: OPERATIONS[step.operation] ?? step.operation.replaceAll('_', ' ') };
  }
  if (step.stage !== 'retrieving' && step.stage !== 'calculating') return { label };
  const subjects = [...new Set(step.subjects.map(describeSubject))];
  return subjects.length ? { label, detail: subjects.join(', ') } : { label };
}

/** Who did a step's work: Jev, GPT, or the Brain's own code. */
export type Worker = 'jev' | 'gpt' | 'code';

export interface WorkShare {
  who: Worker;
  /** Wall time, so two overlapping calls count once. */
  ms: number;
  /** The Jev or GPT calls behind it, as `draft`, `routing ×2` or `review (failed)`. */
  calls: string[];
}

/** A stretch of a step, in the order it happened, and who worked in it. */
export interface WorkSegment {
  who: Worker;
  ms: number;
  /** The Jev or GPT call, as `draft` or `review (failed)`; empty for code. */
  call?: string;
}

export interface WorkedStep extends TurnStep {
  ms: number;
  work: WorkShare[];
  segments: WorkSegment[];
}

/** Where the whole turn's time went in the Brain, and how many calls each model made. */
export interface WorkTotal {
  who: Worker;
  ms: number;
  /** Of the Brain's whole time, 0 to 1. */
  share: number;
  calls: number;
}

interface WorkCall {
  who: 'jev' | 'gpt';
  what: string;
  step: number;
  startMs: number;
  ms: number;
  failed?: boolean;
}

const CALLS: Record<string, string> = {
  routing: 'routing',
  filter: 'record check',
  draft: 'draft',
  review: 'review',
};

/**
 * The turn's steps as the Brain timed them, each with who did its work. A development
 * Brain sends this as `diagnostics.work`: every step it reported, when it began, and
 * every Jev and GPT call with the step it ran in. Steps merge the way `addStep` merged
 * them live. Whatever a step spent outside its calls was the Brain's own code:
 * lookups, calculations, rendering and the ledger's bookkeeping.
 */
export function workedSteps(
  work: unknown
): { steps: WorkedStep[]; endMs: number; calls: Record<'jev' | 'gpt', number> } | undefined {
  if (!work || typeof work !== 'object') return undefined;
  const { steps: rawSteps, calls: rawCalls, endMs } = work as Record<string, unknown>;
  if (!Array.isArray(rawSteps) || !rawSteps.length || typeof endMs !== 'number') return undefined;
  let steps: TurnStep[] = [];
  // Which merged step each reported step became.
  const merged: number[] = [];
  for (const raw of rawSteps) {
    const step = raw as Partial<ProgressUpdate & { atMs: number }>;
    if (typeof step?.stage !== 'string' || typeof step.atMs !== 'number') return undefined;
    steps = addStep(steps, step as ProgressUpdate, step.atMs);
    merged.push(steps.length - 1);
  }
  const calls = (Array.isArray(rawCalls) ? rawCalls : []).filter(
    (call): call is WorkCall =>
      (call?.who === 'jev' || call?.who === 'gpt') &&
      typeof call.what === 'string' &&
      Number.isInteger(call.step) &&
      typeof call.startMs === 'number' &&
      typeof call.ms === 'number'
  );
  return {
    endMs,
    calls: {
      jev: calls.filter((call) => call.who === 'jev').length,
      gpt: calls.filter((call) => call.who === 'gpt').length,
    },
    steps: steps.map((step, index) => {
      const from = step.atMs;
      const to = Math.max(from, steps[index + 1]?.atMs ?? endMs);
      const mine = calls.filter((call) => merged[call.step] === index);
      const work: WorkShare[] = [];
      for (const who of ['jev', 'gpt'] as const) {
        const theirs = mine.filter((call) => call.who === who);
        if (theirs.length) work.push({ who, ms: covered(theirs, from, to), calls: named(theirs) });
      }
      const code = to - from - covered(mine, from, to);
      if (code > 0 || !work.length) work.push({ who: 'code', ms: code, calls: [] });
      return { ...step, ms: to - from, work, segments: segmented(mine, from, to) };
    }),
  };
}

/**
 * The turn's time in the Brain by who did the work, largest first: GPT, Jev and the
 * Brain's own code, with how many calls each model made. Workers with no time and no
 * calls are left out.
 */
export function workTotals(worked: NonNullable<ReturnType<typeof workedSteps>>): WorkTotal[] {
  const totals = new Map<Worker, number>();
  for (const step of worked.steps) {
    for (const share of step.work) totals.set(share.who, (totals.get(share.who) ?? 0) + share.ms);
  }
  const total = Math.max(worked.endMs, 1);
  return (['gpt', 'jev', 'code'] as const)
    .map((who) => ({
      who,
      ms: totals.get(who) ?? 0,
      share: (totals.get(who) ?? 0) / total,
      calls: who === 'code' ? 0 : worked.calls[who],
    }))
    .filter((entry) => entry.ms > 0 || entry.calls > 0)
    .sort((a, b) => b.ms - a.ms);
}

/**
 * A step's time in order: each call as its own stretch, and the code between them.
 * A call that overlaps an earlier one (Jev's record checks run together) adds only
 * its time past that one, so the stretches add up to the step.
 */
function segmented(calls: WorkCall[], from: number, to: number): WorkSegment[] {
  const segments: WorkSegment[] = [];
  let reached = from;
  const add = (who: Worker, until: number, call?: string) => {
    if (until <= reached) return;
    segments.push({ who, ms: until - reached, ...(call ? { call } : {}) });
    reached = until;
  };
  for (const call of [...calls].sort((a, b) => a.startMs - b.startMs)) {
    const start = Math.max(from, call.startMs);
    const end = Math.min(to, call.startMs + call.ms);
    if (end <= start) continue;
    add('code', start);
    add(call.who, end, named([call])[0]);
  }
  add('code', to);
  return segments;
}

/** How much of `from`..`to` the calls cover, counting overlaps once. */
function covered(calls: WorkCall[], from: number, to: number): number {
  const spans = calls
    .map((call) => [Math.max(from, call.startMs), Math.min(to, call.startMs + call.ms)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let reached = from;
  for (const [start, end] of spans) {
    if (end <= reached) continue;
    total += end - Math.max(start, reached);
    reached = end;
  }
  return total;
}

function named(calls: WorkCall[]): string[] {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const name = `${CALLS[call.what] ?? call.what.replaceAll('_', ' ')}${call.failed ? ' (failed)' : ''}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
}
