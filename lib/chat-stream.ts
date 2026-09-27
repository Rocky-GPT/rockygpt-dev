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

function displayDate(value: string | undefined): string {
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
