'use client';

import { brainMetrics, brainTrace } from '@/lib/brain-metrics';
import type { Turn } from './types';

/**
 * How a turn got to its answer: which office lookups the model asked for and how each
 * ended, then who decided the reply, how many model calls it took and what they cost.
 * Everything here is read from the response a development Brain sends when this app asks
 * for diagnostics.
 */
export function TraceView({ turn }: { turn: Turn }) {
  const live = turn.status === 'pending';
  // A failed turn keeps the Brain's own body under `upstreamResponse`.
  const metrics = brainMetrics(turn.raw);
  const trace = brainTrace(turn.raw);
  const hasTrace = trace !== undefined;
  const calls = trace ? trace.filter(isRecordValue) : [];

  return (
    <div className="space-y-6 px-5 py-4">
      <Section title="Tool calls" count={live || !hasTrace ? undefined : calls.length}>
        {calls.length > 0 ? (
          <div className="space-y-2">
            {calls.map((call, index) => (
              <ToolCallCard key={index} call={call} />
            ))}
          </div>
        ) : (
          <Empty>
            {live
              ? 'Tool calls arrive with the answer.'
              : hasTrace
                ? 'No tool calls. The Brain answered without looking anything up.'
                : 'This Brain sent no trace, so what it looked up is unknown.'}
          </Empty>
        )}
      </Section>

      {metrics && (
        <Section title="Details">
          <Details metrics={metrics} datasetVersion={turn.raw?.datasetVersion} />
        </Section>
      )}
    </div>
  );
}

type Tone = 'positive' | 'info' | 'attention' | 'neutral';

export const TONE: Record<Tone, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  attention: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  neutral: 'border-white/10 bg-white/[0.04] text-muted-foreground',
};

/* ----------------------------------------------------------- Tool calls */

function ToolCallCard({ call }: { call: Record<string, unknown> }) {
  const name =
    typeof call.tool === 'string' ? call.tool : typeof call.name === 'string' ? call.name : 'tool';
  const status = typeof call.status === 'string' ? call.status : undefined;
  const count = typeof call.result_count === 'number' ? call.result_count : undefined;
  const total = typeof call.total_matches === 'number' ? call.total_matches : undefined;
  const reason = typeof call.reason === 'string' ? call.reason : undefined;
  const args = argumentChips(isRecordValue(call.arguments) ? call.arguments : undefined);
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

      {typeof call.office === 'string' && (
        <p className="mt-2 text-xs text-muted-foreground">
          Matched <span className="text-foreground">{call.office}</span>
        </p>
      )}
      {Array.isArray(call.candidates) && call.candidates.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Could be <span className="text-foreground">{call.candidates.map(String).join(', ')}</span>
        </p>
      )}
      {reason && <p className="mt-2 text-xs text-amber-300">{reason.replaceAll('_', ' ')}</p>}

      <details className="mt-2.5">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
          Full call
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-black/40 p-2.5 font-mono text-[11px] leading-5 text-muted-foreground">
          {JSON.stringify(call, null, 2)}
        </pre>
      </details>
    </article>
  );
}

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
  for (const [key, value] of Object.entries(args)) add(key.replaceAll('_', ' '), value);
  return chips;
}

/* -------------------------------------------------------------- Details */

function Details({
  metrics,
  datasetVersion,
}: {
  metrics: Record<string, unknown>;
  datasetVersion: unknown;
}) {
  const rows: Array<[string, React.ReactNode]> = [];
  if (typeof metrics.modelCalls === 'number') rows.push(['Model calls', String(metrics.modelCalls)]);
  if (typeof metrics.decidedBy === 'string') {
    rows.push([
      'Decided by',
      metrics.decidedBy === 'phrase_floor'
        ? 'the danger phrase list (no model call)'
        : metrics.decidedBy === 'error' && typeof metrics.errorCode === 'string'
          ? `an error (${metrics.errorCode.replaceAll('_', ' ')})`
          : metrics.decidedBy.replaceAll('_', ' '),
    ]);
  }
  if (Array.isArray(metrics.finish)) {
    rows.push([
      'Model finished with',
      metrics.finish.length
        ? metrics.finish.map(String).join(', ')
        : 'nothing extra (the lookups only)',
    ]);
  }
  if (typeof metrics.officesListed === 'number') {
    rows.push(['Offices shown to the model', String(metrics.officesListed)]);
  }
  if (typeof metrics.committedNusd === 'number' && metrics.committedNusd > 0) {
    rows.push(['Model spend', `$${(metrics.committedNusd / 1e9).toFixed(4)}`]);
  }
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

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
