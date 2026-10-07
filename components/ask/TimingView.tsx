import { brainMetrics } from '@/lib/brain-metrics';
import {
  CATEGORY_COLORS,
  CATEGORY_SWATCHES,
  CATEGORY_HELP,
  CATEGORY_LABELS,
  formatDuration,
  percent,
  summarizeTiming,
  type TimingStep as Step,
  type TimingSummary,
} from '@/lib/timing-groups';
import type { Turn } from './types';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function micros(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Only use server spans when they exactly partition a measured browser interval. */
function brainSteps(turn: Turn, waitUs: number): Step[] | undefined {
  const report = record(brainMetrics(turn.raw)?.timing);
  const totalUs = report?.totalUs;
  const serverUs = turn.timing?.brainTotalUs;
  if (!micros(totalUs) || !micros(serverUs) || serverUs < totalUs || serverUs > waitUs
    || report?.unit !== 'microseconds' || report.accounting !== 'exclusive_wall_time'
    || !Array.isArray(report.steps)) return undefined;
  const steps: Step[] = [];
  let cursor = 0;
  for (const value of report.steps) {
    const step = record(value);
    if (!step || typeof step.label !== 'string' || !micros(step.durationUs)
      || step.startUs !== cursor || !micros(step.endUs)
      || step.endUs - cursor !== step.durationUs) return undefined;
    cursor = step.endUs;
    steps.push({ label: step.label, durationUs: step.durationUs,
      status: typeof step.status === 'string' ? step.status : undefined });
  }
  if (cursor !== totalUs) return undefined;
  steps.push({ label: 'Finalize timing and encode Brain response', durationUs: serverUs - totalUs });
  steps.push({ label: 'Transport, Dev UI proxy and browser wait', durationUs: waitUs - serverUs });
  return steps;
}

function breakdown(turn: Turn): { steps: Step[]; complete: boolean } | undefined {
  const timing = turn.timing;
  if (!timing || !micros(timing.totalUs) || !micros(timing.preparedUs)
    || timing.preparedUs > timing.totalUs) return undefined;
  const { preparedUs, headersUs, bodyUs, totalUs } = timing;
  const steps: Step[] = [{ label: 'Prepare browser request', durationUs: preparedUs }];
  if (!micros(headersUs) || headersUs < preparedUs || headersUs > totalUs) {
    steps.push({ label: 'Request until failure or cancellation · breakdown unavailable',
      durationUs: totalUs - preparedUs });
    return { steps, complete: false };
  }
  const server = brainSteps(turn, headersUs - preparedUs);
  steps.push(...(server ?? [{ label: 'Wait for response · Brain timing unavailable',
    durationUs: headersUs - preparedUs }]));
  if (!micros(bodyUs) || bodyUs < headersUs || bodyUs > totalUs) {
    steps.push({ label: 'Read response until failure', durationUs: totalUs - headersUs });
    return { steps, complete: false };
  }
  steps.push({ label: 'Read response body in browser', durationUs: bodyUs - headersUs });
  steps.push({ label: 'Decode response and prepare display', durationUs: totalUs - bodyUs });
  return { steps, complete: server !== undefined };
}

function formatUs(value: number): string {
  return `${Math.floor(value / 1_000)}.${String(value % 1_000).padStart(3, '0')} ms`;
}

/** The whole turn in the order it happened, one colour per kind of work. */
function Timeline({ summary }: { summary: TimingSummary }) {
  const description = summary.totals
    .map(row => `${CATEGORY_LABELS[row.category]} ${formatDuration(row.durationUs)}`).join(', ');
  return (
    <div>
      <div role="img" aria-label={`Timeline of the turn: ${description}`}
        className="flex h-6 w-full overflow-hidden rounded-full bg-white/[0.04]">
        {summary.segments.map((segment, index) => (
          <div key={index}
            title={`${CATEGORY_LABELS[segment.category]} · ${formatDuration(segment.durationUs)}`
              + (segment.steps > 1 ? ` · ${segment.steps} steps` : '')}
            className={`${CATEGORY_COLORS[segment.category]} flex h-full items-center overflow-hidden`}
            style={segment.tiny ? { flex: '0 0 1px' }
              : { flexGrow: segment.durationUs, flexShrink: 1, flexBasis: 0 }}>
            {!segment.tiny && segment.durationUs / summary.totalUs >= 0.1 && (
              <span className="truncate px-2 text-[10px] font-medium text-white/80">
                {formatDuration(segment.durationUs)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Send</span><span>Answer shown</span>
      </div>
    </div>
  );
}

/** Time per kind of work, biggest first, each as a bar against the whole turn. */
function Totals({ summary }: { summary: TimingSummary }) {
  return (
    <ul className="space-y-1.5">
      {summary.totals.map(row => (
        <li key={row.category} className="flex items-center gap-3 text-xs">
          <span className={`${CATEGORY_SWATCHES[row.category]} h-2.5 w-2.5 shrink-0 rounded-full`} aria-hidden="true" />
          <span className="w-36 shrink-0" title={CATEGORY_HELP[row.category]}>{CATEGORY_LABELS[row.category]}</span>
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden="true">
            <span className={`${CATEGORY_SWATCHES[row.category]} absolute inset-y-0 left-0 rounded-full`}
              style={{ width: `${Math.max(row.share * 100, 0.5)}%` }} />
          </span>
          <span className="w-20 shrink-0 text-right font-mono tabular-nums">{formatDuration(row.durationUs)}</span>
          <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{percent(row.share)}</span>
        </li>
      ))}
    </ul>
  );
}

function Slowest({ summary }: { summary: TimingSummary }) {
  if (summary.slowest.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Slowest steps</p>
      <ol className="space-y-1">
        {summary.slowest.map((step, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span className={`${CATEGORY_SWATCHES[step.category]} h-2 w-2 shrink-0 rounded-full`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={step.label}>{step.label}</span>
            <span className="shrink-0 font-mono tabular-nums">{formatDuration(step.durationUs)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TimingView({ turn }: { turn: Turn }) {
  const result = breakdown(turn);
  if (!result || !turn.timing) {
    return <p className="text-xs text-muted-foreground">{turn.status === 'pending'
      ? 'The measured steps arrive with the response.'
      : 'Detailed timing was not recorded for this turn.'}</p>;
  }
  const summary = summarizeTiming(result.steps);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <span className="text-base font-semibold tabular-nums text-foreground">{formatDuration(turn.timing.totalUs)}</span>
        {' '}from Send to the answer on screen.
        {!result.complete && ' Some internal steps were not recorded; their time is shown as "Not recorded".'}
      </p>
      <Timeline summary={summary} />
      <Totals summary={summary} />
      <Slowest summary={summary} />
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          All {result.steps.length} measured steps
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Each interval is counted once; the rows add up to the total.
            {result.complete && ' Transport/proxy time combines the time around the Brain request. Provider time includes its network round trip.'}
          </p>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Step</th><th className="px-3 py-2 text-right font-medium">Time</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.steps.map((step, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2">
                      {step.label}
                      {step.status && step.status !== 'ok' && <span className="ml-2 text-amber-300">{step.status.replaceAll('_', ' ')}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{formatUs(step.durationUs)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-white/[0.04] font-semibold">
                <tr><td className="px-3 py-2">Total</td><td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{formatUs(turn.timing.totalUs)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
