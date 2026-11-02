'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Loader2, Play, RotateCcw, Send, Square, Upload } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { useNow } from '@/components/ask/useNow';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import {
  COST_PER_ANSWER,
  PRODUCTION_AT_ONCE,
  VERDICT_LABELS,
  waysFor,
  compareResults,
  estimateRun,
  failedReply,
  formatDollars,
  parseQuestions,
  wayFor,
  type Verdict,
  type VerdictKind,
  type WayId,
  type WayResult,
} from '@/lib/laptop-vs-production';

type Cell = { phase: 'asking'; startedAt: number } | { phase: 'done'; result: WayResult };
type Cells = Partial<Record<WayId, Cell>>;

interface BulkRow {
  question: string;
  cells: Cells;
}

async function askOne(way: WayId, question: string, signal: AbortSignal): Promise<WayResult> {
  const started = performance.now();
  try {
    const response = await fetch('/api/local/laptop-vs-production', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ way, question }),
      signal,
    });
    const body = (await response.json()) as WayResult | { error?: string };
    if (response.ok && 'way' in body) return body;
    return failedReply(way, ('error' in body && body.error) || `The dev server answered HTTP ${response.status}.`, 0);
  } catch {
    const seconds = (performance.now() - started) / 1_000;
    return failedReply(way, signal.aborted ? 'Stopped before it answered.' : 'The dev server did not answer.', seconds);
  }
}

function resultsOf(cells: Cells, ways: WayId[]): (WayResult | undefined)[] {
  return ways.map((id) => {
    const cell = cells[id];
    return cell?.phase === 'done' ? cell.result : undefined;
  });
}

const VERDICT_TONES: Record<VerdictKind, PillTone> = {
  agree: 'ok',
  close: 'info',
  differ: 'warn',
  failed: 'bad',
};

function VerdictMarker({ verdict, compact = false }: { verdict: Verdict | null; compact?: boolean }) {
  if (!verdict) return compact ? <span className="text-xs text-muted-foreground">…</span> : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={VERDICT_TONES[verdict.kind]}>{VERDICT_LABELS[verdict.kind]}</StatusPill>
      {!compact && verdict.reasons.map((reason) => (
        <span key={reason} className="text-xs text-muted-foreground">
          {reason}
        </span>
      ))}
    </div>
  );
}

function cellTone(result: WayResult): PillTone {
  if (!result.ok) return 'bad';
  return result.status === 'answered' ? 'ok' : 'warn';
}

function CellStatus({ cell }: { cell: Cell | undefined }) {
  const now = useNow(cell?.phase === 'asking' ? 100 : null);
  if (!cell) return <StatusPill tone="idle">Not asked</StatusPill>;
  if (cell.phase === 'asking') {
    return (
      <StatusPill tone="info">
        <Loader2 className="h-3 w-3 animate-spin" />
        Asking… {((now - cell.startedAt) / 1_000).toFixed(1)} s
      </StatusPill>
    );
  }
  const { result } = cell;
  const label = result.ok ? (result.status ?? 'answered') : result.http ? `HTTP ${result.http}` : 'failed';
  return (
    <StatusPill tone={cellTone(result)}>
      {label} · {result.seconds.toFixed(1)} s
    </StatusPill>
  );
}

function WayColumn({ way, address, cell }: { way: WayId; address?: string; cell: Cell | undefined }) {
  const result = cell?.phase === 'done' ? cell.result : null;
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">
            {wayFor(way).label}
            {wayFor(way).production && (
              <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-amber-300">production</span>
            )}
          </h3>
          <CellStatus cell={cell} />
        </div>
        {address && <p className="truncate font-mono text-[11px] text-muted-foreground">{address}</p>}
      </div>

      {result && !result.ok && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{result.error}</p>
      )}
      {result?.answer && (
        <div className="max-h-[28rem] overflow-y-auto pr-1 text-sm text-neutral-200">
          <BrainMarkdown>{result.answer}</BrainMarkdown>
        </div>
      )}
      {result && (
        <div className="mt-auto space-y-2 border-t border-white/10 pt-3 text-xs">
          <p className="text-muted-foreground">
            Data <span className="font-mono text-foreground">{result.datasetVersion ?? 'unknown'}</span>
          </p>
          {result.citations.length > 0 && (
            <div>
              <p className="mb-1 text-muted-foreground">Sources ({result.citations.length})</p>
              <ol className="space-y-1">
                {result.citations.map((citation, index) => (
                  <li key={`${citation.url}-${index}`} className="truncate">
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      title={citation.url}
                      className="text-sky-300 hover:underline"
                    >
                      {citation.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function WayColumns({ ways, cells, addresses }: { ways: WayId[]; cells: Cells; addresses: Partial<Record<WayId, string>> }) {
  return (
    <div className={`grid gap-3 md:grid-cols-2 ${ways.length > 2 ? 'xl:grid-cols-4' : ''}`}>
      {ways.map((way) => (
        <WayColumn key={way} way={way} address={addresses[way]} cell={cells[way]} />
      ))}
    </div>
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

const button =
  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25`;
const quiet = `${button} border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground`;

export function LaptopVsProduction() {
  const [addresses, setAddresses] = useState<Partial<Record<WayId, string>>>({});
  const [withSites, setWithSites] = useState(false);
  const selected = waysFor(withSites);

  const [question, setQuestion] = useState('');
  const [single, setSingle] = useState<{ question: string; ways: WayId[]; cells: Cells } | null>(null);
  const singleStop = useRef<AbortController | null>(null);

  const [listText, setListText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [bulk, setBulk] = useState<{ ways: WayId[]; rows: BulkRow[]; startedAt: string } | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const bulkStop = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/local/laptop-vs-production', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { addresses?: Record<WayId, string> }) => setAddresses(body.addresses ?? {}))
      .catch(() => setAddresses({}));
  }, []);

  useEffect(() => {
    if (!bulkRunning) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [bulkRunning]);

  const singleBusy = single !== null && Object.values(single.cells).some((cell) => cell?.phase === 'asking');

  const askSingle = useCallback(
    async (text: string, ways: WayId[]) => {
      const asked = text.trim();
      if (!asked || ways.length === 0) return;
      singleStop.current?.abort();
      const stop = new AbortController();
      singleStop.current = stop;
      const startedAt = Date.now();
      const cells: Cells = Object.fromEntries(ways.map((way) => [way, { phase: 'asking', startedAt }]));
      setSingle({ question: asked, ways, cells });
      await Promise.all(
        ways.map(async (way) => {
          const result = await askOne(way, asked, stop.signal);
          setSingle((current) =>
            current && singleStop.current === stop
              ? { ...current, cells: { ...current.cells, [way]: { phase: 'done', result } } }
              : current
          );
        })
      );
    },
    []
  );

  const questions = parseQuestions(listText);
  const estimate = estimateRun(questions.length, selected);

  const runBulk = useCallback(async (list: string[], ways: WayId[]) => {
    setConfirming(false);
    const rows: BulkRow[] = list.map((text) => ({ question: text, cells: {} }));
    const stop = new AbortController();
    bulkStop.current = stop;
    setBulk({ ways, rows, startedAt: new Date().toISOString() });
    setOpen(null);
    setBulkRunning(true);
    const update = (index: number, way: WayId, cell: Cell) =>
      setBulk((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row, at) => (at === index ? { ...row, cells: { ...row.cells, [way]: cell } } : row)),
            }
          : current
      );
    // One question at a time, its ways together: production gets at most 2 at once.
    for (let index = 0; index < rows.length && !stop.signal.aborted; index += 1) {
      const startedAt = Date.now();
      for (const way of ways) update(index, way, { phase: 'asking', startedAt });
      await Promise.all(
        ways.map(async (way) => {
          const result = await askOne(way, rows[index].question, stop.signal);
          update(index, way, { phase: 'done', result });
        })
      );
    }
    setBulkRunning(false);
  }, [setOpen]);

  const bulkDone = bulk ? bulk.rows.filter((row) => bulk.ways.every((way) => row.cells[way]?.phase === 'done')).length : 0;
  const counts = bulk
    ? bulk.rows.reduce<Partial<Record<VerdictKind, number>>>((total, row) => {
        const verdict = compareResults(resultsOf(row.cells, bulk.ways));
        if (verdict) total[verdict.kind] = (total[verdict.kind] ?? 0) + 1;
        return total;
      }, {})
    : {};

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setListText(await file.text());
    setConfirming(false);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div>
          <h2 className="font-semibold text-foreground">Ask one question</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same question goes to the laptop Brain and the production Brain. Each answer costs about{' '}
            {formatDollars(COST_PER_ANSWER)}. The wording is not judged: the writer words it fresh every time.
          </p>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-foreground hover:bg-white/5">
          <input
            type="checkbox"
            checked={withSites}
            onChange={(event) => setWithSites(event.target.checked)}
            disabled={bulkRunning}
            className="accent-sky-400"
          />
          Also check the websites
          <span className="text-muted-foreground">
            (laptop site and live site, through <span className="font-mono">/api/chat</span> like a student&rsquo;s browser)
          </span>
        </label>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void askSingle(question, selected);
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. When does the library close tonight?"
            maxLength={2_000}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-400/60 focus:outline-none"
          />
          {singleBusy ? (
            <button type="button" className={quiet} onClick={() => singleStop.current?.abort()}>
              <Square className="h-4 w-4" /> Stop
            </button>
          ) : (
            <button type="submit" className={primary} disabled={!question.trim() || selected.length === 0}>
              <Send className="h-4 w-4" /> Ask {selected.length === 2 ? 'both' : 'all four'}
            </button>
          )}
        </form>

        {single && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-foreground">&ldquo;{single.question}&rdquo;</p>
              {!singleBusy && (
                <button type="button" className={quiet} onClick={() => void askSingle(single.question, single.ways)}>
                  <RotateCcw className="h-4 w-4" /> Ask again
                </button>
              )}
            </div>
            <VerdictMarker verdict={compareResults(resultsOf(single.cells, single.ways))} />
            <WayColumns ways={single.ways} cells={single.cells} addresses={addresses} />
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div>
          <h2 className="font-semibold text-foreground">Bulk run</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste questions, one per line, or upload a .txt or .csv file. Lines starting with # are skipped. Questions run one
            at a time, so production never gets more than {PRODUCTION_AT_ONCE} at once.
          </p>
        </div>

        <textarea
          value={listText}
          onChange={(event) => {
            setListText(event.target.value);
            setConfirming(false);
          }}
          rows={6}
          disabled={bulkRunning}
          placeholder={'Where is the Registrar?\nWhat time does the shuttle leave for the train station?'}
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-400/60 focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
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
          <button type="button" className={quiet} disabled={bulkRunning} onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> Upload a file
          </button>
          <span className="text-sm text-muted-foreground">
            {questions.length} {questions.length === 1 ? 'question' : 'questions'}
          </span>
          <div className="flex-1" />
          {bulkRunning ? (
            <button type="button" className={quiet} onClick={() => bulkStop.current?.abort()}>
              <Square className="h-4 w-4" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className={primary}
              disabled={questions.length === 0 || selected.length === 0}
              onClick={() => setConfirming(true)}
            >
              <Play className="h-4 w-4" /> Run all
            </button>
          )}
        </div>

        {confirming && !bulkRunning && (
          <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p>
              This asks {questions.length} {questions.length === 1 ? 'question' : 'questions'}, {selected.length} ways
              each: {estimate.answers} answers, about{' '}
              <strong>{formatDollars(estimate.dollars)}</strong>
              {estimate.productionAnswers > 0 && (
                <>
                  {' '}
                  ({estimate.productionAnswers} on production, about {formatDollars(estimate.productionDollars)})
                </>
              )}
              . It takes about {estimate.minutes} {estimate.minutes === 1 ? 'minute' : 'minutes'}.
            </p>
            <div className="flex gap-2">
              <button type="button" className={primary} onClick={() => void runBulk(questions, selected)}>
                <Play className="h-4 w-4" /> Start
              </button>
              <button type="button" className={quiet} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {bulk && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium text-foreground">
                {bulkDone} of {bulk.rows.length} done
              </span>
              {(Object.keys(VERDICT_LABELS) as VerdictKind[]).map((kind) =>
                counts[kind] ? (
                  <StatusPill key={kind} tone={VERDICT_TONES[kind]}>
                    {counts[kind]} {VERDICT_LABELS[kind].toLowerCase()}
                  </StatusPill>
                ) : null
              )}
              <div className="flex-1" />
              {!bulkRunning && (
                <button
                  type="button"
                  className={quiet}
                  onClick={() =>
                    download(`laptop-vs-production-${bulk.startedAt.replace(/[:.]/g, '-')}.json`, {
                      startedAt: bulk.startedAt,
                      ways: bulk.ways,
                      rows: bulk.rows.map((row) => ({
                        question: row.question,
                        verdict: compareResults(resultsOf(row.cells, bulk.ways)),
                        results: resultsOf(row.cells, bulk.ways),
                      })),
                    })
                  }
                >
                  <Download className="h-4 w-4" /> Download results
                </button>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                style={{ width: `${bulk.rows.length ? (bulkDone / bulk.rows.length) * 100 : 0}%` }}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 py-2 pr-2">#</th>
                    <th className="py-2 pr-3">Question</th>
                    {bulk.ways.map((way) => (
                      <th key={way} className="whitespace-nowrap py-2 pr-3">
                        {wayFor(way).label}
                      </th>
                    ))}
                    <th className="py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {bulk.rows.map((row, index) => {
                    const expanded = open === index;
                    const verdict = compareResults(resultsOf(row.cells, bulk.ways));
                    const started = bulk.ways.some((way) => row.cells[way]);
                    return (
                      <BulkResultRow
                        key={index}
                        index={index}
                        row={row}
                        ways={bulk.ways}
                        verdict={started ? verdict : null}
                        started={started}
                        expanded={expanded}
                        onToggle={() => setOpen(expanded ? null : index)}
                        addresses={addresses}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function BulkResultRow({
  index,
  row,
  ways,
  verdict,
  started,
  expanded,
  onToggle,
  addresses,
}: {
  index: number;
  row: BulkRow;
  ways: WayId[];
  verdict: Verdict | null;
  started: boolean;
  expanded: boolean;
  onToggle: () => void;
  addresses: Partial<Record<WayId, string>>;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer border-t border-white/10 align-top hover:bg-white/5 ${started ? '' : 'opacity-60'}`}
        onClick={onToggle}
      >
        <td className="py-2 pr-2 tabular-nums text-muted-foreground">{index + 1}</td>
        <td className="py-2 pr-3 text-foreground">
          <span className="inline-flex items-start gap-1">
            {expanded ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {row.question}
          </span>
        </td>
        {ways.map((way) => (
          <td key={way} className="whitespace-nowrap py-2 pr-3">
            {row.cells[way] ? <CellStatus cell={row.cells[way]} /> : <span className="text-xs text-muted-foreground">waiting</span>}
          </td>
        ))}
        <td className="py-2">{started ? <VerdictMarker verdict={verdict} compact /> : null}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={ways.length + 3} className="pb-4 pt-1">
            <div className="space-y-3">
              <VerdictMarker verdict={verdict} />
              <WayColumns ways={ways} cells={row.cells} addresses={addresses} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
