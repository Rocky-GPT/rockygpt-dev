/**
 * Repeat Test: every question of a set asked several times at once, to see whether the
 * bot gives the same answer each time or got lucky once.
 *
 * This is the page's shared logic. Code decides whether two tries gave the same answer,
 * so checking is free: same status and the same facts (times, dates, phone numbers, emails,
 * rooms, prices, other numbers, and the names in any list). The wording does not count, since
 * the writer words the same facts fresh every time, and neither do the links: Dan's first run
 * (11-03, 50 questions x5) showed the same facts cited from different pages, and the same link
 * with and without a trailing "." or "/", flagging steady answers as flaky. The clock time an
 * answer mentions ("open now (10:49am)") is not a fact either: it moves between tries.
 */

import type { WayResult } from './laptop-vs-production';

export type RepeatBrain = 'laptop-brain' | 'production-brain';

export const REPEAT_BRAINS: { id: RepeatBrain; label: string; atOnce: number; secondsPerAnswer: number }[] = [
  // The laptop Brain answers 8 turns at once and turns a 9th away with 429 "busy"
  // (rockygpt-brain api/app.py, max_concurrent=8).
  { id: 'laptop-brain', label: 'Laptop Brain', atOnce: 8, secondsPerAnswer: 15 },
  // Production's small Render server: 2 at once, like Laptop vs Production.
  { id: 'production-brain', label: 'Production Brain', atOnce: 2, secondsPerAnswer: 29 },
];

export function repeatBrain(id: RepeatBrain) {
  return REPEAT_BRAINS.find((brain) => brain.id === id) ?? REPEAT_BRAINS[0];
}

export function isRepeatBrain(value: unknown): value is RepeatBrain {
  return value === 'laptop-brain' || value === 'production-brain';
}

export const MIN_TIMES = 5;
export const MAX_TIMES = 10;
export const TIMES_CHOICES = [5, 6, 7, 8, 9, 10];
/**
 * Roughly what one answer costs in Luna calls, kept on the high side. The 11-03 Mac check
 * measured about $0.0003 an answer (15 answers, $0.0044; code-written answers cost nothing),
 * so this is about 3 times that. The real spend is shown as answers come back.
 */
export const COST_PER_ANSWER = 0.001;
/** A run estimated above this shows its cost box in red. */
export const LOUD_DOLLARS = 1;

export interface RepeatQuestion {
  id: string;
  question: string;
  /** What a good reply has, from the set, when the set says. */
  goodReply?: string;
  mustNot?: string;
}

export interface QuestionSet {
  /** The file's path inside rockygpt-evals, which is also how the page asks for it. */
  path: string;
  name: string;
  folder: string;
  count: number;
  /** Frozen sets are run once, by hand, never from here. */
  locked: boolean;
}

/** Frozen sets carry "frozen" in their file name (questions-frozen.json, check-frozen.json). */
export function isFrozen(path: string): boolean {
  return /frozen/i.test(path);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A set file's questions: a JSON list of {id?, question, good_reply?, must_not?}, or one per line. */
export function readSetFile(name: string, body: string): RepeatQuestion[] {
  if (name.endsWith('.json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown })?.questions)
        ? (parsed as { questions: unknown[] }).questions
        : [];
    const items = list.flatMap((item, index) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const question = text(row.question);
      if (!question) return [];
      return [
        {
          id: text(row.id) ?? `q${index + 1}`,
          question,
          goodReply: text(row.good_reply) ?? text(row.goodReply) ?? text(row.expected),
          mustNot: text(row.must_not) ?? text(row.mustNot),
        },
      ];
    });
    return items.length === list.length ? items : [];
  }
  return pastedQuestions(body);
}

/** Pasted or uploaded lines: one question per line, # comments and blank lines skipped. */
export function pastedQuestions(body: string): RepeatQuestion[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/^(?:\d+[.)]|[-*•])\s+/, '').trim())
    .map((line) => (/^".*"$/.test(line) ? line.slice(1, -1).replace(/""/g, '"').trim() : line))
    .filter((line, index) => line.length > 0 && line.length <= 2_000 && !(index === 0 && /^questions?$/i.test(line)))
    .slice(0, 200)
    .map((question, index) => ({ id: `q${index + 1}`, question }));
}

// ---------------------------------------------------------------------------
// Facts: what has to be the same for two tries to count as the same answer.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

function clockTime(hour: string, minute: string | undefined, half: string): string {
  return `${Number(hour)}:${minute ?? '00'}${half.replace(/\./g, '').toLowerCase()}`;
}

/**
 * The facts in an answer, each as a short normalized string such as "time 7:00pm",
 * "phone 2016847500", "date nov 3", "room d-101", "$ 45.00", "number 18" or "item open mic night".
 */
/** An answer without its links, its "Sources:" list, its citation markers and the clock time it was written. */
export function withoutLinks(answer: string): string {
  return answer
    .replace(/\n\s*\**sources?\**:[\s\S]*$/i, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/[^\s)\]>"']+/gi, ' ')
    .replace(/\[\d+(?:,\s*\d+)*\]/g, ' ')
    .replace(/\b(open|closed)( right)? now\s*\(\s*\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?\s*\)/gi, '$1 now');
}

/**
 * The facts in an answer. `clock`, when given, is when the try was answered: a time within
 * 5 minutes of it is the answer saying what time it is, not a fact.
 */
export function answerFacts(answer: string, clock?: Date): string[] {
  const facts = new Set<string>();
  const text = withoutLinks(answer);
  // List numbers ("1.", "2)") are not facts; the list's names are.
  let rest = text.replace(/^(\s*)\d+[.)]\s+/gm, '$1');
  const now = clock ? clock.getHours() * 60 + clock.getMinutes() : null;
  const isNow = (hour: string, minute: string | undefined, half: string) => {
    if (now === null) return false;
    const h = (Number(hour) % 12) + (/^p/i.test(half) ? 12 : 0);
    const minutes = h * 60 + Number(minute ?? 0);
    return Math.min(Math.abs(minutes - now), 1440 - Math.abs(minutes - now)) <= 5;
  };
  const take = (pattern: RegExp, fact: (match: RegExpExecArray) => string | null) => {
    rest = rest.replace(pattern, (...args) => {
      const match = args as unknown as RegExpExecArray;
      const value = fact(match);
      if (value) facts.add(value);
      return ' ';
    });
  };

  // Names in a list: "- **Open Mic Night**, 7 PM" -> "open mic night".
  for (const line of text.split('\n')) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (!item) continue;
    const bold = /\*\*(.+?)\*\*/.exec(item[1]);
    const name = (bold?.[1] ?? item[1].split(/[,:(–—]| - /)[0])
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
      .toLowerCase();
    if (name && name.length <= 80) facts.add(`item ${name}`);
  }

  // ISO dates and timestamps ("captured 2026-11-02T17:58:09.601000+00:00") are the date only.
  take(/\b(20\d\d)-(\d\d)-(\d\d)(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)?/g, (match) =>
    `date ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[3])}`
  );
  take(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (match) => `email ${match[0].toLowerCase()}`);
  take(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g, (match) => `phone ${match[1]}${match[2]}${match[3]}`);
  take(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)(?![a-z])/gi, (match) =>
    isNow(match[1], match[2], match[3]) ? null : `time ${clockTime(match[1], match[2], match[3])}`
  );
  take(/\bnoon\b/gi, () => 'time 12:00pm');
  take(/\bmidnight\b/gi, () => 'time 12:00am');
  take(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'), (match) =>
    `date ${MONTHS[MONTHS.indexOf(match[1].slice(0, 3).toLowerCase())]} ${Number(match[2])}`
  );
  take(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, (match) => `date ${MONTHS[Number(match[1]) - 1] ?? match[1]} ${Number(match[2])}`);
  take(/\$\s?(\d[\d,]*(?:\.\d{2})?)/g, (match) => `$ ${Number(match[1].replace(/,/g, '')).toFixed(2)}`);
  take(/\b([A-Z]{1,4})-?(\d{2,4}[A-Z]?)\b/g, (match) => (/\d/.test(match[2]) && /[A-Z]/.test(match[1]) ? `room ${match[1].toLowerCase()}-${match[2].toLowerCase()}` : null));
  take(/\b\d[\d,]*(?:\.\d+)?\b/g, (match) => `number ${match[0].replace(/,/g, '')}`);
  return [...facts].sort();
}

export interface TryKey {
  status: string;
  facts: string[];
}

export function tryKey(result: WayResult, clock?: Date): TryKey {
  return { status: result.status ?? 'none', facts: answerFacts(result.answer, clock) };
}

function keyText(key: TryKey): string {
  return JSON.stringify(key);
}

// ---------------------------------------------------------------------------
// Groups and verdicts.

export interface AnswerGroup {
  /** A, B, C... from the most common answer down. */
  letter: string;
  /** Which tries (0-based) gave this answer. */
  tries: number[];
  key: TryKey;
  /** One try's reply, to show. */
  sample: WayResult;
  /** How this answer differs from A, in plain words; empty for A. */
  differences: string[];
}

export interface Grouping {
  groups: AnswerGroup[];
  /** Letter per try: A, B, ... or X for a try that failed; null while it is still asking. */
  letters: (string | null)[];
  failed: number[];
}

const LETTERS = 'ABCDEFGHIJ';

function listOf(values: string[], limit = 4): string {
  const shown = values.slice(0, limit).map((value) => value.replace(/^(item|time|date|phone|email|room|number|\$) /, (_, kind) => (kind === '$' ? '$' : '')));
  return shown.join(', ') + (values.length > limit ? ` and ${values.length - limit} more` : '');
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** How group G's answer differs from group A's, most telling first. */
export function differences(a: TryKey, g: TryKey): string[] {
  const reasons: string[] = [];
  if (a.status !== g.status) reasons.push(`Status ${g.status}, not ${a.status}`);
  const missingItems = a.facts.filter((fact) => fact.startsWith('item ') && !g.facts.includes(fact));
  const extraItems = g.facts.filter((fact) => fact.startsWith('item ') && !a.facts.includes(fact));
  if (missingItems.length) reasons.push(`List leaves out ${plural(missingItems.length, 'name')}: ${listOf(missingItems)}`);
  if (extraItems.length) reasons.push(`List adds ${plural(extraItems.length, 'name')}: ${listOf(extraItems)}`);
  const missing = a.facts.filter((fact) => !fact.startsWith('item ') && !g.facts.includes(fact));
  const extra = g.facts.filter((fact) => !fact.startsWith('item ') && !a.facts.includes(fact));
  if (missing.length) reasons.push(`Leaves out ${listOf(missing)}`);
  if (extra.length) reasons.push(`Adds ${listOf(extra)}`);
  return reasons;
}

/**
 * Group the tries that are back by answer; failed tries stay out of every group. `clocks[i]`
 * is when try i was answered, so the clock time it mentions is not counted as a fact.
 */
export function groupTries(tries: (WayResult | undefined)[], clocks: (Date | undefined)[] = []): Grouping {
  const byKey = new Map<string, { tries: number[]; key: TryKey; sample: WayResult }>();
  const failed: number[] = [];
  tries.forEach((result, index) => {
    if (!result) return;
    if (!result.ok) {
      failed.push(index);
      return;
    }
    const key = tryKey(result, clocks[index]);
    const text = keyText(key);
    const group = byKey.get(text) ?? { tries: [], key, sample: result };
    group.tries.push(index);
    byKey.set(text, group);
  });
  const sorted = [...byKey.values()].sort((a, b) => b.tries.length - a.tries.length || a.tries[0] - b.tries[0]);
  const groups = sorted.map((group, index) => ({
    letter: LETTERS[index] ?? '?',
    tries: group.tries,
    key: group.key,
    sample: group.sample,
    differences: index === 0 ? [] : differences(sorted[0].key, group.key),
  }));
  const letters = tries.map((result, index) => {
    if (!result) return null;
    if (!result.ok) return 'X';
    return groups.find((group) => group.tries.includes(index))?.letter ?? null;
  });
  return { groups, letters, failed };
}

export type VerdictKind = 'steady' | 'off' | 'flaky' | 'failed' | 'asking' | 'waiting';

export interface RepeatVerdict {
  kind: VerdictKind;
  /** The pill text: Steady, 1 off, Flaky, Failed, Asking…, Waiting. */
  label: string;
  /** Tries that gave the most common answer. */
  match: number;
  /** Tries that did not: other answers and failures. */
  off: number;
}

/**
 * Dan's rule (11-03): an answer that comes out different or wrong 2 or more times out of 5
 * is flaky. With more tries it is the same share: 40% or more off.
 */
export function isFlaky(off: number, times: number): boolean {
  return off > 0 && off / times >= 0.4;
}

export function verdictFor(grouping: Grouping, times: number, asking: number): RepeatVerdict {
  const back = grouping.letters.filter((letter) => letter !== null).length;
  const match = grouping.groups[0]?.tries.length ?? 0;
  const off = back - match;
  if (back < times) {
    return { kind: asking > 0 || back > 0 ? 'asking' : 'waiting', label: asking > 0 || back > 0 ? 'Asking…' : 'Waiting', match, off };
  }
  if (match === 0) return { kind: 'failed', label: 'Failed', match, off };
  if (off === 0) return { kind: 'steady', label: 'Steady', match, off };
  if (isFlaky(off, times)) return { kind: 'flaky', label: 'Flaky', match, off };
  return { kind: 'off', label: `${off} off`, match, off };
}

/** Flakiest first: fewest matching tries, then most failures, then set order. */
export function flakiness(verdict: RepeatVerdict): number {
  const order: Record<VerdictKind, number> = { failed: 0, flaky: 1, off: 2, asking: 3, waiting: 4, steady: 5 };
  return order[verdict.kind] * 100 + verdict.match;
}

// ---------------------------------------------------------------------------
// Cost and time.

export interface RepeatEstimate {
  answers: number;
  dollars: number;
  minutes: number;
  atOnce: number;
  loud: boolean;
}

export function estimateRepeat(questions: number, times: number, brain: RepeatBrain): RepeatEstimate {
  const { atOnce, secondsPerAnswer } = repeatBrain(brain);
  const answers = questions * times;
  const dollars = answers * COST_PER_ANSWER;
  return {
    answers,
    dollars,
    minutes: answers ? Math.max(1, Math.round((Math.ceil(answers / atOnce) * secondsPerAnswer) / 60)) : 0,
    atOnce,
    loud: dollars > LOUD_DOLLARS,
  };
}

/** What a turn really cost, from a development Brain's metrics (committedNusd = billionths of a dollar). */
export function spentDollars(result: WayResult): number | null {
  const raw = result.raw as { metrics?: { committedNusd?: unknown } } | null;
  const nusd = raw?.metrics?.committedNusd;
  return typeof nusd === 'number' && Number.isFinite(nusd) ? nusd / 1e9 : null;
}
