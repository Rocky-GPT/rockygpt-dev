'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Loader2, Lock, Play, RotateCcw, Square, Upload } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { useNow } from '@/components/ask/useNow';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import { failedReply, formatDollars, type WayResult } from '@/lib/laptop-vs-production';
import {
  COST_PER_ANSWER,
  REPEAT_BRAINS,
  TIMES_CHOICES,
  estimateRepeat,
  flakiness,
  groupTries,
  pastedQuestions,
  repeatBrain,
  spentDollars,
  verdictFor,
  type Grouping,
  type QuestionSet,
  type RepeatBrain,
  type RepeatQuestion,
  type RepeatVerdict,
  type VerdictKind,
} from '@/lib/repeat-test';

type Try = { phase: 'asking'; startedAt: number } | { phase: 'done'; result: WayResult; answeredAt: number } | undefined;

interface Run {
  label: string;
  brain: RepeatBrain;
  times: number;
  questions: RepeatQuestion[];
  tries: Try[][];
  startedAt: number;
  finishedAt: number | null;
}

type Filter = 'all' | 'unsteady' | 'steady' | 'pending';

const button =
  'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25`;
const quiet = `${button} border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground`;
const card = 'rounded-2xl border border-white/10 bg-white/5 p-5';
const label = 'mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

const VERDICT_TONES: Record<VerdictKind, PillTone> = {
  steady: 'ok',
  off: 'warn',
  flaky: 'bad',
  failed: 'bad',
  asking: 'info',
  waiting: 'idle',
};

const LETTER_STYLES: Record<string, string> = {
  A: 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200',
  B: 'border-amber-400/55 bg-amber-400/20 text-amber-100',
  C: 'border-purple-400/55 bg-purple-400/20 text-purple-100',
  D: 'border-pink-400/55 bg-pink-400/20 text-pink-100',
  X: 'border-red-500/55 bg-red-500/20 text-red-200',
};
const OTHER_LETTER = 'border-sky-300/40 bg-sky-300/10 text-sky-100';

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-white/10">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`border-r border-white/10 px-3.5 py-1.5 text-sm last:border-r-0 disabled:cursor-not-allowed ${
            option.value === value ? 'bg-sky-500/20 font-semibold text-sky-50' : 'text-muted-foreground hover:bg-white/5'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TryBox({ letter, asking, title }: { letter: string | null; asking: boolean; title: string }) {
  const base = 'inline-flex h-5 w-5 items-center justify-center rounded-md border font-mono text-[10.5px] font-bold';
  if (asking) {
    return (
      <span title={title} className={`${base} border-sky-400/55 bg-sky-400/10 text-sky-300`}>
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (!letter) return <span title={title} className={`${base} border-dashed border-zinc-600`} />;
  return (
    <span title={title} className={`${base} ${LETTER_STYLES[letter] ?? OTHER_LETTER}`}>
      {letter === 'X' ? '✕' : letter}
    </span>
  );
}

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function askTry(brain: RepeatBrain, question: string, signal: AbortSignal): Promise<WayResult> {
  const started = performance.now();
  try {
    const response = await fetch('/api/local/repeat-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brain, question }),
      signal,
    });
    const body = (await response.json()) as WayResult | { error?: string };
    if (response.ok && 'way' in body) return body;
    return failedReply(brain, ('error' in body && body.error) || `The dev server answered HTTP ${response.status}.`, 0);
  } catch {
    const seconds = (performance.now() - started) / 1_000;
    return failedReply(brain, signal.aborted ? 'Stopped before it answered.' : 'The dev server did not answer.', seconds);
  }
}

function resultsOf(tries: Try[]): (WayResult | undefined)[] {
  return tries.map((item) => (item?.phase === 'done' ? item.result : undefined));
}

/** When each try was answered, so the clock time an answer mentions is not counted as a fact. */
function clocksOf(tries: Try[]): (Date | undefined)[] {
  return tries.map((item) => (item?.phase === 'done' ? new Date(item.answeredAt) : undefined));
}

function minutesSeconds(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

interface Row {
  index: number;
  question: RepeatQuestion;
  tries: Try[];
  grouping: Grouping;
  verdict: RepeatVerdict;
}

export function RepeatTest() {
  const [source, setSource] = useState<'set' | 'paste'>('set');
  const [sets, setSets] = useState<QuestionSet[] | null>(null);
  const [setsFolder, setSetsFolder] = useState('');
  const [setPath, setSetPath] = useState('');
  const [setQuestions, setSetQuestions] = useState<RepeatQuestion[]>([]);
  const [setError, setSetError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [times, setTimes] = useState(5);
  const [brain, setBrain] = useState<RepeatBrain>('laptop-brain');
  const [confirming, setConfirming] = useState(false);

  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);
  const stopRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const runSection = useRef<HTMLElement>(null);
  const now = useNow(running ? 1_000 : null);

  useEffect(() => {
    fetch('/api/local/repeat-test', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { folder?: string; sets?: QuestionSet[] }) => {
        const list = body.sets ?? [];
        setSets(list);
        setSetsFolder(body.folder ?? '');
        const first = list.find((item) => !item.locked);
        if (first) setSetPath(first.path);
      })
      .catch(() => setSets([]));
  }, []);

  useEffect(() => {
    if (!setPath) return;
    setSetError(null);
    fetch(`/api/local/repeat-test?set=${encodeURIComponent(setPath)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as { questions?: RepeatQuestion[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        setSetQuestions(body.questions ?? []);
      })
      .catch((error: unknown) => {
        setSetQuestions([]);
        setSetError(error instanceof Error ? error.message : 'Could not read the set.');
      });
  }, [setPath]);

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const questions = source === 'set' ? setQuestions : pastedQuestions(pasteText);
  const chosenSet = sets?.find((item) => item.path === setPath);
  const estimate = estimateRepeat(questions.length, times, brain);

  /** Ask every [question, try] pair, `atOnce` at a time, in set order. */
  const start = useCallback(async (next: Omit<Run, 'tries' | 'startedAt' | 'finishedAt'>) => {
    setConfirming(false);
    setOpen(null);
    setFilter('all');
    const stop = new AbortController();
    stopRef.current = stop;
    setRun({
      ...next,
      tries: next.questions.map(() => Array.from({ length: next.times }, () => undefined)),
      startedAt: Date.now(),
      finishedAt: null,
    });
    setRunning(true);
    window.setTimeout(() => runSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    const set = (q: number, t: number, value: Try) =>
      setRun((current) =>
        current
          ? {
              ...current,
              tries: current.tries.map((row, at) => (at === q ? row.map((cell, k) => (k === t ? value : cell)) : row)),
            }
          : current
      );
    const queue = next.questions.flatMap((_, q) => Array.from({ length: next.times }, (_, t) => [q, t] as const));
    let cursor = 0;
    const worker = async () => {
      while (!stop.signal.aborted && cursor < queue.length) {
        const [q, t] = queue[cursor];
        cursor += 1;
        set(q, t, { phase: 'asking', startedAt: Date.now() });
        const result = await askTry(next.brain, next.questions[q].question, stop.signal);
        set(q, t, { phase: 'done', result, answeredAt: Date.now() });
      }
    };
    await Promise.all(Array.from({ length: repeatBrain(next.brain).atOnce }, worker));
    setRun((current) => (current ? { ...current, finishedAt: Date.now() } : current));
    setRunning(false);
  }, []);

  const rows: Row[] = useMemo(
    () =>
      run
        ? run.questions.map((question, index) => {
            const tries = run.tries[index];
            const grouping = groupTries(resultsOf(tries), clocksOf(tries));
            const asking = tries.filter((item) => item?.phase === 'asking').length;
            return { index, question, tries, grouping, verdict: verdictFor(grouping, run.times, asking) };
          })
        : [],
    [run]
  );

  const counts = rows.reduce<Record<VerdictKind, number>>(
    (total, row) => ({ ...total, [row.verdict.kind]: total[row.verdict.kind] + 1 }),
    { steady: 0, off: 0, flaky: 0, failed: 0, asking: 0, waiting: 0 }
  );
  const done = rows.filter((row) => !['asking', 'waiting'].includes(row.verdict.kind));
  const allTries = run?.tries.flat() ?? [];
  const back = allTries.filter((item) => item?.phase === 'done').length;
  const askingNow = allTries.filter((item) => item?.phase === 'asking').length;
  const failedTries = allTries.filter((item) => item?.phase === 'done' && !item.result.ok).length;
  let spent = 0;
  let guessed = false;
  for (const item of allTries) {
    if (item?.phase !== 'done' || !item.result.ok) continue;
    const real = spentDollars(item.result);
    spent += real ?? COST_PER_ANSWER;
    guessed ||= real === null;
  }

  const finished = run !== null && !running;
  const unsteady = (row: Row) => ['off', 'flaky', 'failed'].includes(row.verdict.kind);
  const shown = rows
    .filter((row) =>
      filter === 'all'
        ? true
        : filter === 'unsteady'
          ? unsteady(row)
          : filter === 'steady'
            ? row.verdict.kind === 'steady'
            : row.verdict.kind === 'asking' || row.verdict.kind === 'waiting'
    )
    .sort((a, b) => (finished ? flakiness(a.verdict) - flakiness(b.verdict) || a.index - b.index : a.index - b.index));
  const flakyQuestions = rows.filter((row) => row.verdict.kind === 'flaky' || row.verdict.kind === 'failed').map((row) => row.question);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setPasteText(await file.text());
    setConfirming(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold text-foreground">1. Questions</h2>
          <div className="mt-3">
            <Segmented
              options={[
                { value: 'set', label: 'Pick a set' },
                { value: 'paste', label: 'Paste or upload' },
              ]}
              value={source}
              onChange={(value) => {
                setSource(value);
                setConfirming(false);
              }}
              disabled={running}
            />
          </div>

          {source === 'set' ? (
            <>
              <p className={label}>Set</p>
              {sets === null ? (
                <p className="text-sm text-muted-foreground">Reading rockygpt-evals…</p>
              ) : sets.length === 0 ? (
                <p className="text-sm text-amber-200">
                  No question sets found in <span className="font-mono">{setsFolder || 'rockygpt-evals'}</span>. Paste
                  the questions instead.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/20 py-1 text-sm">
                  {sets.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      disabled={item.locked || running}
                      onClick={() => {
                        setSetPath(item.path);
                        setConfirming(false);
                      }}
                      title={item.path}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed ${
                        item.path === setPath ? 'bg-sky-500/15 text-sky-50' : item.locked ? 'text-zinc-500' : 'hover:bg-white/5'
                      }`}
                    >
                      {item.locked && <Lock className="h-3.5 w-3.5 shrink-0" />}
                      <span className={`whitespace-nowrap ${item.locked ? '' : 'text-foreground'}`}>{item.name}</span>
                      <span className="truncate text-muted-foreground">
                        · {item.folder} · {item.count}
                        {item.locked && ' · frozen'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {setError && <p className="mt-2 text-sm text-red-300">{setError}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                Sets come from the rockygpt-evals folder on this laptop. Frozen sets are locked: they are run once, by
                hand, never from here.
              </p>
            </>
          ) : (
            <>
              <p className={label}>One question per line · # lines are skipped</p>
              <textarea
                value={pasteText}
                onChange={(event) => {
                  setPasteText(event.target.value);
                  setConfirming(false);
                }}
                rows={8}
                disabled={running}
                placeholder={'registrar # ?\nanything fun goin on tonite'}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-400/60 focus:outline-none"
              />
              <div className="mt-2 flex items-center gap-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    void loadFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <button type="button" className={quiet} disabled={running} onClick={() => fileInput.current?.click()}>
                  <Upload className="h-4 w-4" /> Upload a file
                </button>
                <span className="text-sm text-muted-foreground">
                  {questions.length} {questions.length === 1 ? 'question' : 'questions'}
                </span>
              </div>
            </>
          )}
        </section>

        <section className={card}>
          <h2 className="font-semibold text-foreground">2. How many times</h2>
          <p className={label}>Ask each question</p>
          <Segmented
            options={TIMES_CHOICES.map((value) => ({ value, label: `${value}×` }))}
            value={times}
            onChange={(value) => {
              setTimes(value);
              setConfirming(false);
            }}
            disabled={running}
          />
          <p className={label}>Which Brain</p>
          <Segmented
            options={REPEAT_BRAINS.map((item) => ({ value: item.id, label: item.label }))}
            value={brain}
            onChange={(value) => {
              setBrain(value);
              setConfirming(false);
            }}
            disabled={running}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            The laptop Brain runs 8 asks at the same time (its limit). Production runs 2 at a time, so it is much slower,
            and it costs production money.
          </p>
          <p className={label}>What counts as the same answer</p>
          <p className="text-sm text-neutral-300">
            Same status and the same facts: times, dates, phone numbers, emails, rooms, prices, other numbers, and the
            names in any list. Wording, links and the clock time (&ldquo;open now (10:49am)&rdquo;) don&rsquo;t count. Code
            compares them, so checking is free.
          </p>
        </section>
      </div>

      <section className={card}>
        {confirming && !running ? (
          <div className="space-y-3">
            <div
              className={`rounded-xl border p-4 text-sm ${
                estimate.loud ? 'border-red-500/50 bg-red-500/10 text-red-100' : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
              }`}
            >
              This asks{' '}
              <strong>
                {questions.length} {questions.length === 1 ? 'question' : 'questions'} × {times} times = {estimate.answers}{' '}
                answers
              </strong>{' '}
              on the {repeatBrain(brain).label.toLowerCase()}. About <strong>{formatDollars(estimate.dollars)}</strong> in
              Luna calls and about{' '}
              <strong>
                {estimate.minutes} {estimate.minutes === 1 ? 'minute' : 'minutes'}
              </strong>
              , {estimate.atOnce} at a time.
              {estimate.loud && ' This is over $1.'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={primary}
                onClick={() =>
                  void start({
                    label: source === 'set' ? (chosenSet?.name ?? 'set') : 'pasted list',
                    brain,
                    times,
                    questions,
                  })
                }
              >
                <Play className="h-4 w-4" /> Start {estimate.answers} answers
              </button>
              <button type="button" className={quiet} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primary}
              disabled={running || questions.length === 0}
              onClick={() => setConfirming(true)}
            >
              <Play className="h-4 w-4" /> Run {questions.length} {questions.length === 1 ? 'question' : 'questions'} ×{' '}
              {times}
            </button>
            <span className="text-sm text-muted-foreground">
              {estimate.answers} answers · about {formatDollars(estimate.dollars)} · about {estimate.minutes} min. You see
              the cost again before it starts.
            </span>
          </div>
        )}
      </section>

      {run && (
        <section ref={runSection} className={`${card} scroll-mt-4 space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                {run.label} · {run.questions.length} questions × {run.times} · {repeatBrain(run.brain).label}
                {finished && ' · done'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Started {new Date(run.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ·{' '}
                {finished ? 'took' : ''} {minutesSeconds((run.finishedAt ?? now) - run.startedAt)}
                {!finished && ' so far'} · spent {formatDollars(spent)}
                {guessed && ' (partly estimated)'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {running ? (
                <button type="button" className={quiet} onClick={() => stopRef.current?.abort()}>
                  <Square className="h-4 w-4" /> Stop
                </button>
              ) : (
                <>
                  {flakyQuestions.length > 0 && (
                    <button
                      type="button"
                      className={quiet}
                      onClick={() =>
                        void start({ label: `${run.label} (flaky ones again)`, brain: run.brain, times: run.times, questions: flakyQuestions })
                      }
                    >
                      <RotateCcw className="h-4 w-4" /> Rerun only the {flakyQuestions.length} flaky ones · about{' '}
                      {formatDollars(flakyQuestions.length * run.times * COST_PER_ANSWER)}
                    </button>
                  )}
                  <button
                    type="button"
                    className={quiet}
                    onClick={() =>
                      download(`repeat-test-${new Date(run.startedAt).toISOString().replace(/[:.]/g, '-')}.json`, {
                        set: run.label,
                        brain: run.brain,
                        times: run.times,
                        startedAt: new Date(run.startedAt).toISOString(),
                        spentDollars: Number(spent.toFixed(4)),
                        rows: rows.map((row) => ({
                          id: row.question.id,
                          question: row.question.question,
                          verdict: row.verdict,
                          letters: row.grouping.letters,
                          groups: row.grouping.groups.map((group) => ({
                            letter: group.letter,
                            tries: group.tries,
                            differences: group.differences,
                            facts: group.key.facts,
                          })),
                          tries: row.tries.map((item) =>
                            item?.phase === 'done' ? { ...item.result, answeredAt: new Date(item.answeredAt).toISOString() } : null
                          ),
                        })),
                      })
                    }
                  >
                    <Download className="h-4 w-4" /> Download results
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Stat value={`${back}`} sub={`/ ${allTries.length}`} caption="answers back" />
            {running && <Stat value={`${askingNow}`} caption="asking right now" tone="text-sky-300" />}
            <Stat value={`${counts.steady}`} caption={`steady (${run.times} of ${run.times})`} tone="text-emerald-300" />
            <Stat value={`${counts.off}`} caption="a little off" tone="text-amber-300" />
            <Stat value={`${counts.flaky}`} caption="flaky (40%+ off)" tone="text-red-300" />
            <Stat value={`${failedTries}`} caption={failedTries === 1 ? 'error' : 'errors'} tone={failedTries ? 'text-red-300' : undefined} />
            {done.length > 0 && (
              <Stat value={`${Math.round((counts.steady / done.length) * 100)}%`} caption={`steady of ${done.length} done`} />
            )}
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
              style={{ width: `${allTries.length ? (back / allTries.length) * 100 : 0}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Segmented
              options={[
                { value: 'all' as Filter, label: `All ${rows.length}` },
                { value: 'unsteady' as Filter, label: `Not steady ${counts.off + counts.flaky + counts.failed}` },
                { value: 'steady' as Filter, label: `Steady ${counts.steady}` },
                ...(running ? [{ value: 'pending' as Filter, label: `Not done ${counts.asking + counts.waiting}` }] : []),
              ]}
              value={filter}
              onChange={setFilter}
            />
            <span>
              Each box is one try. Same letter = same answer; A is the most common one, ✕ is an error.
              {finished && ' Flakiest first.'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-24 py-2 pr-2">ID</th>
                  <th className="py-2 pr-3">Question</th>
                  <th className="py-2 pr-3">Tries</th>
                  <th className="whitespace-nowrap py-2 pr-3">Match</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <RepeatRow
                    key={row.index}
                    row={row}
                    times={run.times}
                    expanded={open === row.index}
                    onToggle={() => setOpen(open === row.index ? null : row.index)}
                    onAgain={
                      running
                        ? undefined
                        : () =>
                            void start({
                              label: `${row.question.id} again`,
                              brain: run.brain,
                              times: run.times,
                              questions: [row.question],
                            })
                    }
                  />
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nothing here.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ value, sub, caption, tone }: { value: string; sub?: string; caption: string; tone?: string }) {
  return (
    <div className="min-w-28 rounded-xl border border-white/10 px-3.5 py-2">
      <p className={`text-xl font-semibold ${tone ?? 'text-foreground'}`}>
        {value}
        {sub && <span className="ml-1 text-sm font-normal text-muted-foreground">{sub}</span>}
      </p>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

function RepeatRow({
  row,
  times,
  expanded,
  onToggle,
  onAgain,
}: {
  row: Row;
  times: number;
  expanded: boolean;
  onToggle: () => void;
  onAgain?: () => void;
}) {
  const { verdict, grouping, tries, question } = row;
  const back = grouping.letters.filter((letter) => letter !== null).length;
  const finished = verdict.kind !== 'asking' && verdict.kind !== 'waiting';
  const failures = grouping.failed.map((index) => ({ index, result: (tries[index] as { result: WayResult }).result }));
  return (
    <>
      <tr className="cursor-pointer border-t border-white/10 align-middle hover:bg-white/5" onClick={onToggle}>
        <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">{question.id}</td>
        <td className="py-2 pr-3 text-foreground">
          <span className="inline-flex items-start gap-1">
            {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
            {question.question}
          </span>
        </td>
        <td className="whitespace-nowrap py-2 pr-3">
          <span className="inline-flex gap-1">
            {tries.map((item, index) => (
              <TryBox
                key={index}
                letter={grouping.letters[index]}
                asking={item?.phase === 'asking'}
                title={
                  item?.phase === 'done'
                    ? `Try ${index + 1}: ${item.result.ok ? (item.result.status ?? 'answered') : item.result.error} · ${item.result.seconds.toFixed(1)} s`
                    : `Try ${index + 1}: ${item ? 'asking' : 'waiting'}`
                }
              />
            ))}
          </span>
        </td>
        <td className="whitespace-nowrap py-2 pr-3">
          {finished ? (
            <>
              <span className="font-semibold text-foreground">{verdict.match}</span>
              <span className="text-muted-foreground"> of {times} match</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {back} of {times} back
            </span>
          )}
        </td>
        <td className="py-2">
          <StatusPill tone={VERDICT_TONES[verdict.kind]}>{verdict.label}</StatusPill>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td />
          <td colSpan={4} className="space-y-3 pb-5 pt-1">
            {question.goodReply && (
              <p className="text-xs">
                <span className="text-muted-foreground">What a good reply has (from the set): </span>
                <span className="text-neutral-200">{question.goodReply}</span>
                {question.mustNot && (
                  <>
                    <span className="text-muted-foreground"> · Must not: </span>
                    <span className="text-neutral-200">{question.mustNot}</span>
                  </>
                )}
              </p>
            )}
            {grouping.groups.length === 0 && failures.length === 0 && (
              <p className="text-xs text-muted-foreground">No answers back yet.</p>
            )}
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {grouping.groups.map((group) => (
                <div key={group.letter} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <TryBox letter={group.letter} asking={false} title="" />
                    <span className="text-sm font-semibold text-foreground">
                      {group.tries.length} of {times} {group.tries.length === 1 ? 'try' : 'tries'}
                    </span>
                    <StatusPill tone={group.sample.status === 'answered' ? 'idle' : 'warn'}>
                      {group.sample.status ?? 'answered'} · {group.sample.seconds.toFixed(1)} s
                    </StatusPill>
                  </div>
                  <div className="max-h-80 overflow-y-auto pr-1 text-[13px] text-neutral-200">
                    <BrainMarkdown>{group.sample.answer}</BrainMarkdown>
                  </div>
                  <div className="mt-2 border-t border-white/10 pt-2 text-xs text-muted-foreground">
                    {group.differences.length ? (
                      <>
                        <p className="text-amber-200">Differs from A:</p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {group.differences.map((difference) => (
                            <li key={difference}>{difference}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p>
                        Sources:{' '}
                        {group.sample.citations.length
                          ? group.sample.citations.map((citation) => citation.title).join(' · ')
                          : 'none'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {failures.length > 0 && (
                <div className="min-w-0 rounded-xl border border-red-500/30 bg-red-500/5 p-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    <TryBox letter="X" asking={false} title="" />
                    <span className="text-sm font-semibold text-foreground">
                      {failures.length} of {times} failed
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-red-100">
                    {failures.map(({ index, result }) => (
                      <li key={index}>
                        Try {index + 1}: {result.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {onAgain && (
              <button type="button" className={quiet} onClick={onAgain}>
                <RotateCcw className="h-4 w-4" /> Ask this one {times} more times · about {formatDollars(times * COST_PER_ANSWER)}
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
