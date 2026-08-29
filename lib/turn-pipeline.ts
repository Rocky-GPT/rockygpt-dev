/**
 * @module lib/turn-pipeline
 * One turn, flattened and staged.
 *
 * Lifted whole from the student app's message inspector, where it was tangled
 * with the modal that drew it. The split is at the data/JSX seam: everything
 * here is pure, so the panel that renders a live turn and anything that later
 * renders a stored one cannot drift apart in how they read a trace.
 *
 * `turnPipeline`'s own note about there being exactly one implementation is now
 * satisfied structurally rather than by discipline — it lives in `lib/`, and
 * every consumer imports it from here.
 *
 * The eight `brainTrace` keys are not eight boxes. `question` is the header and
 * `answer` is the footer, six of the remaining keys are boxes, and the seventh
 * box — `others` — is assembled from top-level response fields that no stage
 * owns. The comments below record why each box behaves as it does; they are the
 * accumulated result of specific decisions, not decoration.
 */

/**
 * One box per stage of a turn, in the order the brain ran them. Reading down
 * the modal is reading the request: what was asked, what BRAIN #1 made of it,
 * what PYTHON did with that, and what BRAIN #3 wrote.
 *
 * The first box is the question and nothing else. The clock leads the BRAIN #1
 * box instead, because that is what the question was read against — and
 * because a `currentTime` sitting beside the question reads as something the
 * client sent, which it never is.
 */
/**
 * Hidden from the drawn payload, kept in every copy. Each earlier turn carries
 * its own id and timestamp, which is three lines of bookkeeping per turn in a
 * box whose point is the conversation.
 */
export const BOOKKEEPING = ['requestId', 'createdAt'] as const;

/**
 * The clock and the modes ride in the header, so the memory box does not
 * repeat them. All three stay in the copy — `currentTime` especially, since it
 * is what BRAIN #1 resolved `tomorrow` against.
 */
const UNDRAWN_IN_MEMORY = [...BOOKKEEPING, 'currentTime', 'styleMode', 'responseMode'] as const;

/** The modes the client asked for, as `label · value` for the header. */
export function modeChips(context: Record<string, unknown> | undefined): string[] {
  const chips: string[] = [];
  if (typeof context?.styleMode === 'string') chips.push(`style · ${context.styleMode}`);
  if (typeof context?.responseMode === 'string') chips.push(`response · ${context.responseMode}`);
  return chips;
}

/**
 * Earlier turns, as one exchange per entry.
 *
 * The wire carries a turn per speaker — `{role, content}` — which is the shape
 * the models are given and the shape a copy must reproduce. On screen it costs
 * two objects and six lines to say something that never varies: the questions
 * are always the student's and the answers are always Rocky's. Paired, an
 * exchange is two lines and reads as the conversation it is.
 *
 * Handles the brain's own memory shape too (`user`/`assistant` already in one
 * object), which is what a client that sends no history of its own gets back.
 */
function pairTurns(turns: readonly unknown[]): unknown[] {
  const exchanges: unknown[] = [];
  const open = (): Record<string, unknown> | undefined => {
    const last = exchanges[exchanges.length - 1];
    return last && typeof last === 'object' && !Array.isArray(last)
      ? (last as Record<string, unknown>)
      : undefined;
  };

  for (const turn of turns) {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
      exchanges.push(turn);
      continue;
    }
    const { role, content, user, assistant, ...rest } = turn as Record<string, unknown>;
    if (user !== undefined || assistant !== undefined) {
      exchanges.push({ question: user, answer: assistant, ...rest });
    } else if (role === 'user') {
      exchanges.push({ question: content, ...rest });
    } else if (role === 'assistant') {
      const pending = open();
      // An assistant turn with no question before it keeps its own entry
      // rather than being folded into an unrelated exchange.
      if (pending && !('answer' in pending)) pending.answer = content;
      else exchanges.push({ answer: content, ...rest });
    } else {
      exchanges.push(turn);
    }
  }
  return exchanges;
}

/** The question stage, with its history paired up. */
function asExchanges(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.earlierTurns)) return data;
  return { ...record, earlierTurns: pairTurns(record.earlierTurns) };
}

/**
 * The routing answers, as marks rather than words.
 *
 * Only for the eye. The brain sends `Yes` and `No`, which is what the copied
 * JSON, the admin log and the terminal all keep — a tick is quicker to scan
 * down a column but is a poor thing to grep for, and it is two columns wide in
 * a terminal that assumed one.
 */
const MARK: Record<string, string> = { Yes: '✅', No: '❌' };

function withMarkedRouting(plan: unknown): unknown {
  if (!isRecord(plan) || !isRecord(plan.routing)) return plan;
  const routing = Object.fromEntries(
    Object.entries(plan.routing).map(([key, value]) => [
      key,
      typeof value === 'string' && value in MARK ? MARK[value] : value,
    ]),
  );
  return { ...plan, routing };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const STAGES: ReadonlyArray<{
  key: string;
  title: string;
  /** What this box draws. Defaults to the pipeline field named by `key`. */
  select?: (pipeline: Record<string, unknown>) => unknown;
  /** Starts shut behind a View control instead of being permanently open. */
  collapsed?: boolean;
  /**
   * Drop the box entirely when it has nothing in it, rather than drawing
   * `null`. For a stage that only some lanes have, an empty box reads as a
   * stage that failed — and in a pipeline where a failure stops the turn, that
   * is a alarming thing to show for a turn that went fine.
   */
  omitWhenEmpty?: boolean;
  preview?: (data: unknown) => unknown;
  /**
   * Fields to leave undrawn. A function when what is worth drawing depends on
   * the values — a field that merely repeats its neighbour is noise on the
   * turns it repeats and the whole point on the turns it does not. Display
   * only: `Copy all JSON` carries the trace whole either way.
   */
  hidden?: readonly string[] | ((data: unknown) => readonly string[]);
}> = [
  // `question` and `answer` are both absent: they are the two payloads that
  // are prose rather than structure, and they bracket the modal as the header
  // and footer instead. What scrolls between them is the machinery, in the
  // order it ran, with the context it ran against beneath it.
  // Context first: what the question drew on, before what BRAIN #1 made of
  // it. Absent when BRAIN #1 says the question needed nothing.
  { key: 'context', title: 'CONTEXT · what this question uses', omitWhenEmpty: true },
  // Each box below is one brain's own output. `lane` and `capability` sit with
  // the plan because BRAIN #2 decides them — they were in the understand box
  // while the split was cosmetic, which read as BRAIN #1 choosing the lane it
  // is deliberately never shown enough to choose.
  {
    key: 'understanding',
    title: 'BRAIN #1 · understand',
    // `usesContext` is undrawn: the context box above appears exactly when it
    // is true, so printing the flag as well says the same thing twice.
    //
    // `resolvedQuestion` goes the same way when it came back identical to
    // `normalizedQuestion` — the usual case, where nothing needed resolving
    // and the two lines are the same sentence printed twice. What is left is
    // a box that shows a resolution exactly when there was one to show.
    hidden: (data) => {
      const read = data as { normalizedQuestion?: unknown; resolvedQuestion?: unknown } | null;
      const echoed = read != null && read.resolvedQuestion === read.normalizedQuestion;
      return [...BOOKKEEPING, 'usesContext', ...(echoed ? ['resolvedQuestion'] : [])];
    },
  },
  {
    // Never omitted. PYTHON acts on this and nothing else, so a turn without a
    // plan section would be a turn with nothing to run.
    key: 'plan',
    title: 'BRAIN #2 · plan',
    select: (p) => withMarkedRouting(p.plan),
  },
  {
    key: 'normalizedPlan',
    title: 'PYTHON · normalize the plan',
    omitWhenEmpty: true,
  },
  { key: 'execution', title: 'PYTHON · execute the lane' },
  // The memory is reference rather than pipeline: carried on every request
  // whether it matters or not, empty on a first turn and long on a tenth.
  {
    key: 'memory',
    title: 'MEMORY · short term',
    preview: asExchanges,
    hidden: UNDRAWN_IN_MEMORY,
    // Shut by default. With the clock and the modes in the header this is the
    // conversation and nothing else — empty on a first turn, long on a tenth,
    // and reference either way rather than part of the pipeline.
    collapsed: true,
  },
  // One box, not three. These are what the turn returned alongside the answer,
  // and two of them are `[]` on every turn today — three headers to say so was
  // more chrome than content. Gathered, they are still legible when the CODE
  // lane starts citing its sources and they stop being empty.
  {
    key: 'others',
    title: 'OTHERS · what else came back',
    select: (p) => pick(p, ['suggestedQuestions', 'citations', 'uiActions']),
    // Shut by default. Nothing in here explains an answer — it is what the
    // client does next — so it costs a screen of scrolling to say very little.
    // The byte count on its header still shows without opening it.
    collapsed: true,
  },
  // `answer` is deliberately absent: prose reads badly as a one-line JSON
  // string, so the last stage is the footer below instead. `Copy all JSON`
  // still carries it, because it copies the whole trace.
];

/**
 * Response fields the trace or the surrounding chrome already carries.
 * `brainTrace` becomes the stages, `answer` the footer, `question` the header,
 * so folding them in again would duplicate the whole turn.
 *
 * Everything else in the response is folded in — including `requestId` and
 * `route`, which no stage draws. They are undrawn, not dropped: the id ties a
 * turn to the admin log and `route` is what that log filters on, so both have
 * to survive `Copy all JSON`. An error turn carries none of these three, so
 * its whole body is folded in exactly when that is what you need.
 */
const CARRIED_ELSEWHERE = ['brainTrace', 'answer', 'question'] as const;

/** The named fields, in the order given, as one object. */
function pick(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

/** Top level only — a nested `answer` inside a uiAction is not a duplicate. */
function omitTopLevel(
  record: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * One turn as a single object: the trace's stages, then every other field of
 * the response.
 *
 * Exported because the transcript-wide copy builds the same thing for every
 * message. Two copy paths that disagreed about the shape would be worse than
 * one — whatever you paste should look the same whether it came from a turn or
 * from the whole conversation.
 */
export function turnPipeline(
  payload: Record<string, unknown> | undefined
): Record<string, unknown> {
  return {
    ...(recordValue(payload?.brainTrace) ?? {}),
    ...(payload ? omitTopLevel(payload, CARRIED_ELSEWHERE) : {}),
  };
}
