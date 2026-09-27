'use client';

import { describeStep, displayDate, type TurnStep } from '@/lib/chat-stream';
import { useNow } from './useNow';
import type { Turn } from './types';

/**
 * How a turn got to its answer, in the order it happened: where the time
 * went, what Jev decided, which lookups ran, and what the writer and checker
 * cost. Everything here is read from the response the Brain sent, plus the
 * steps it streamed on the way.
 */
export function TraceView({ turn }: { turn: Turn }) {
  const live = turn.status === 'pending';
  const metrics = record(turn.raw?.metrics);
  const routing = readRouting(metrics?.routing);
  const calls = Array.isArray(turn.raw?.trace) ? turn.raw.trace.filter(isRecordValue) : [];
  const timings = Array.isArray(metrics?.toolResults)
    ? metrics.toolResults.filter(isRecordValue)
    : [];

  return (
    <div className="space-y-6 px-5 py-4">
      {turn.steps && turn.steps.length > 0 && (
        <Section title="Timeline">
          <Timeline
            steps={turn.steps}
            live={live}
            startedAt={turn.startedAt}
            totalMs={turn.latencyMs}
          />
        </Section>
      )}

      {routing && (
        <Section title="Route">
          <RouteCard routing={routing} />
        </Section>
      )}

      <Section title="Tool calls" count={live ? undefined : calls.length}>
        {calls.length > 0 ? (
          <div className="space-y-2">
            {calls.map((call, index) => (
              <ToolCallCard key={index} call={call} timing={timings[index]} />
            ))}
          </div>
        ) : (
          <Empty>
            {live
              ? 'Tool calls arrive with the answer.'
              : 'No tool calls. The Brain answered without looking anything up.'}
          </Empty>
        )}
      </Section>

      {metrics && (
        <Section title="Details">
          <Details metrics={metrics} datasetVersion={turn.raw?.datasetVersion} />
        </Section>
      )}

      {live && !turn.steps?.length && <Empty>Waiting for the first step…</Empty>}
    </div>
  );
}

/* ------------------------------------------------------------------ Jev */

export interface Routing {
  mode?: string;
  model?: string;
  version?: string;
  route?: string;
  confidence?: number | null;
  directRetrieval?: boolean;
  fallbackReason?: string | null;
  elapsedMs?: number;
}

export function readRouting(value: unknown): Routing | undefined {
  const routing = record(value);
  if (!routing || routing.mode === 'off') return undefined;
  return routing as Routing;
}

type Tone = 'positive' | 'info' | 'attention' | 'neutral';

const HANDOFF: Record<string, string> = {
  uncertain_route: 'Jev was not sure enough of the route, so GPT chose.',
  arguments_unresolved: 'Jev chose the route and GPT filled in the lookup details.',
  ambiguous_entities: 'The question names more than one place or person, so GPT chose.',
  routing_timeout: 'Jev ran out of time, so GPT chose.',
  routing_context_limit: 'The conversation was too long for Jev, so GPT chose.',
  routing_unavailable: 'Jev could not be reached, so GPT chose.',
  routing_price_unavailable: 'Jev had no current price, so it was skipped and GPT chose.',
  routing_data_unavailable: 'Campus names could not be loaded for Jev, so GPT chose.',
  routing_invalid_response: 'Jev sent back an answer that did not check out, so GPT chose.',
};

/** What Jev did on this turn, said in a sentence and a tone. */
export function summarizeRouting(routing: Routing): {
  short: string;
  sentence: string;
  tone: Tone;
} {
  const pick = routing.route && routing.route !== 'unresolved' ? routing.route : undefined;
  const sure =
    typeof routing.confidence === 'number' ? ` ${Math.round(routing.confidence * 100)}%` : '';
  if (routing.mode === 'shadow') {
    return {
      short: `Jev (shadow)${pick ? ` · ${pick}${sure}` : ''}`,
      sentence: 'Jev ran in shadow mode: its pick was recorded, and GPT made every call.',
      tone: 'neutral',
    };
  }
  if (routing.directRetrieval) {
    return {
      short: `Jev · ${pick ?? 'route'}${sure}`,
      sentence: 'Jev ran the first lookup itself, so GPT skipped that call.',
      tone: 'positive',
    };
  }
  if (!routing.fallbackReason) {
    return {
      short: `Jev · ${pick ?? 'route'}${sure}`,
      sentence: 'Jev chose the route and GPT wrote the lookup for it.',
      tone: 'info',
    };
  }
  if (routing.fallbackReason === 'arguments_unresolved') {
    return {
      short: `Jev · ${pick ?? 'route'}${sure}`,
      sentence: HANDOFF.arguments_unresolved,
      tone: 'info',
    };
  }
  return {
    short: 'Jev → GPT',
    sentence:
      HANDOFF[routing.fallbackReason] ??
      `Handed to GPT: ${routing.fallbackReason.replaceAll('_', ' ')}.`,
    tone: 'attention',
  };
}

export const TONE: Record<Tone, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  attention: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  neutral: 'border-white/10 bg-white/[0.04] text-muted-foreground',
};

function RouteCard({ routing }: { routing: Routing }) {
  const { sentence, tone } = summarizeRouting(routing);
  const confidence = typeof routing.confidence === 'number' ? routing.confidence : undefined;

  return (
    <div className="rounded-xl border border-border bg-neutral-950/60 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">
          {routing.route && routing.route !== 'unresolved' ? (
            <>
              Jev picked <span className="font-mono text-sky-300">{routing.route}</span>
            </>
          ) : (
            'Jev could not pick a route'
          )}
        </p>
        {routing.mode && (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            {routing.mode}
          </span>
        )}
        {typeof routing.elapsedMs === 'number' && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {formatMs(routing.elapsedMs)}
          </span>
        )}
      </div>

      {confidence !== undefined && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-sky-400"
              style={{ width: `${Math.max(2, Math.min(100, confidence * 100))}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-foreground">
            {Math.round(confidence * 100)}% sure
          </span>
        </div>
      )}

      <p className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${TONE[tone]}`}>
        {sentence}
      </p>

      {(routing.model || routing.version) && (
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {[routing.model, routing.version].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Tool calls */

function ToolCallCard({
  call,
  timing,
}: {
  call: Record<string, unknown>;
  timing?: Record<string, unknown>;
}) {
  const name =
    typeof call.tool === 'string' ? call.tool : typeof call.name === 'string' ? call.name : 'tool';
  const status = typeof call.status === 'string' ? call.status : undefined;
  const count = typeof call.result_count === 'number' ? call.result_count : undefined;
  const total = typeof call.total_matches === 'number' ? call.total_matches : undefined;
  const elapsed = typeof timing?.elapsed_ms === 'number' ? timing.elapsed_ms : undefined;
  const reason = typeof call.reason === 'string' ? call.reason : undefined;
  const args = argumentChips(record(call.arguments));
  const ok = status === 'ok';

  return (
    <article className="rounded-xl border border-border bg-neutral-950/60 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-mono text-sm font-semibold text-foreground">{name}</span>
        {status && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              ok ? TONE.positive : TONE.attention
            }`}
          >
            {status.replaceAll('_', ' ')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          {count !== undefined && (
            <span>
              {count}
              {total !== undefined && total > count ? ` of ${total}` : ''} result
              {count === 1 ? '' : 's'}
              {call.truncated === true ? ' · cut short' : ''}
            </span>
          )}
          {elapsed !== undefined && <span>{formatMs(elapsed)}</span>}
        </span>
      </div>

      {args.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {args.map(([key, value]) => (
            <li
              key={key}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs"
            >
              <span className="text-muted-foreground">{key}</span>{' '}
              <span className="text-foreground">{value}</span>
            </li>
          ))}
        </ul>
      )}

      {reason && <p className="mt-2 text-xs text-amber-300">{reason.replaceAll('_', ' ')}</p>}

      <details className="mt-2.5">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
          Full call
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-black/40 p-2.5 font-mono text-[11px] leading-5 text-foreground">
          {JSON.stringify(call, null, 2)}
        </pre>
      </details>
    </article>
  );
}

/** The arguments worth reading at a glance: set values only, nested filters flattened. */
function argumentChips(args: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!args) return [];
  const chips: Array<[string, string]> = [];
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value)) {
      if (value.length) chips.push([key, value.map(String).join(', ')]);
    } else if (typeof value === 'object') {
      for (const [inner, item] of Object.entries(value as Record<string, unknown>))
        add(inner, item);
    } else if (typeof value === 'boolean') {
      chips.push([key, value ? 'yes' : 'no']);
    } else {
      chips.push([key, String(value)]);
    }
  };
  const from = args.date_from;
  const to = args.date_to;
  for (const [key, value] of Object.entries(args)) {
    if (key === 'date_to' && from) continue;
    if (key === 'date_from' && typeof from === 'string') {
      const day = displayDate(from) || from;
      const until = typeof to === 'string' && to !== from ? displayDate(to) || to : '';
      chips.push(['dates', until ? `${day} to ${until}` : day]);
      continue;
    }
    add(key.replaceAll('_', ' '), value);
  }
  return chips;
}

/* ------------------------------------------------------------- Timeline */

const STAGE_COLOR: Record<string, string> = {
  connecting: 'bg-neutral-500',
  understanding: 'bg-violet-400',
  retrieving: 'bg-sky-400',
  calculating: 'bg-cyan-400',
  composing: 'bg-emerald-400',
  reviewing: 'bg-amber-400',
};

/**
 * Where the time went: one bar split by stage, then each stage with how long
 * it took. The last stage runs until the answer arrived, or until now while
 * the Brain is still on it.
 */
function Timeline({
  steps,
  live,
  startedAt,
  totalMs,
}: {
  steps: TurnStep[];
  live: boolean;
  startedAt: number;
  totalMs?: number;
}) {
  const { spans, end, total } = useSpans(steps, live, startedAt, totalMs);

  return (
    <div className="rounded-xl border border-border bg-neutral-950/60 p-4">
      <StageBar spans={spans} live={live} total={total} />

      <ol className="mt-3.5 space-y-2">
        {spans.map(({ step, ms }, index) => {
          const { label, detail } = describeStep(step);
          const running = live && index === spans.length - 1;
          return (
            <li key={index} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STAGE_COLOR[step.stage] ?? 'bg-neutral-400'}`}
              />
              <span className="min-w-0 flex-1">
                <span className={running ? 'text-foreground' : 'text-foreground/85'}>
                  {label}
                  {running ? '…' : ''}
                </span>
                {detail && (
                  <span className="block text-xs leading-5 text-muted-foreground">{detail}</span>
                )}
              </span>
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatMs(ms)}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 border-t border-border pt-2.5 text-right font-mono text-[11px] text-muted-foreground">
        {live ? 'so far ' : 'total '}
        <span className="text-foreground">{formatMs(end)}</span>
      </p>
    </div>
  );
}

interface Span {
  step: TurnStep;
  ms: number;
}

/** How long each step lasted: until the next one began, or until the end. */
function useSpans(steps: TurnStep[], live: boolean, startedAt: number, totalMs?: number) {
  const now = useNow(live ? 250 : null);
  const last = steps[steps.length - 1]?.atMs ?? 0;
  const end = live ? Math.max(0, now - startedAt) : (totalMs ?? last);
  const total = Math.max(end, last, 1);
  const spans: Span[] = steps.map((step, index) => ({
    step,
    ms: Math.max(0, (steps[index + 1]?.atMs ?? total) - step.atMs),
  }));
  return { spans, end, total };
}

/** The steps so far as one growing bar, for the answer while it is being made. */
export function LiveStepBar({ steps, startedAt }: { steps: TurnStep[]; startedAt: number }) {
  const { spans, total } = useSpans(steps, true, startedAt);
  return <StageBar spans={spans} live total={total} />;
}

function StageBar({ spans, live, total }: { spans: Span[]; live: boolean; total: number }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
      {spans.map(({ step, ms }, index) => (
        <div
          key={index}
          title={describeStep(step).label}
          className={`${STAGE_COLOR[step.stage] ?? 'bg-neutral-400'} h-full border-r border-neutral-950/60 last:border-r-0 ${
            live && index === spans.length - 1 ? 'animate-pulse' : ''
          }`}
          style={{ width: `${(ms / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- Details */

function Details({
  metrics,
  datasetVersion,
}: {
  metrics: Record<string, unknown>;
  datasetVersion: unknown;
}) {
  const failures = Array.isArray(metrics.validationFailures) ? metrics.validationFailures : [];
  const modelCalls = [
    ['Jev', metrics.routingCalls],
    ['draft', metrics.draftCalls],
    ['review', metrics.reviewCalls],
  ]
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([name, value]) => `${value} ${name}`)
    .join(' · ');
  const rows: Array<[string, React.ReactNode]> = [];
  if (typeof metrics.responseMode === 'string') {
    rows.push(['Answer style', metrics.responseMode.replaceAll('_', ' ')]);
  }
  if (modelCalls) rows.push(['Model calls', modelCalls]);
  if (typeof metrics.retrievalMs === 'number')
    rows.push(['Lookup time', formatMs(metrics.retrievalMs)]);
  if (typeof metrics.fallbackUsed === 'boolean') {
    rows.push([
      'Fallback',
      metrics.fallbackUsed ? (
        <span className="text-amber-300">
          used
          {typeof metrics.fallbackReason === 'string'
            ? ` · ${metrics.fallbackReason.replaceAll('_', ' ')}`
            : ''}
        </span>
      ) : (
        'not used'
      ),
    ]);
  }
  rows.push([
    'Checks failed',
    failures.length ? (
      <span className="text-amber-300">{failures.map(String).join(', ')}</span>
    ) : (
      'none'
    ),
  ]);
  if (typeof datasetVersion === 'string') {
    rows.push([
      'Dataset',
      <span key="dataset" className="font-mono">
        {datasetVersion}
      </span>,
    ]);
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border border-border bg-neutral-950/60 p-4 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------- Helpers */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
        {title}
        {count !== undefined && (
          <span className="font-mono text-[10px] font-normal text-muted-foreground">{count}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function formatMs(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(1)} s`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return isRecordValue(value) ? value : undefined;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
