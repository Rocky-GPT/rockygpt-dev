import { brainMetrics } from '@/lib/brain-metrics';
import type { Turn } from './types';

interface Step {
  label: string;
  durationUs: number;
  status?: string;
}

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

export function TimingView({ turn }: { turn: Turn }) {
  const result = breakdown(turn);
  if (!result || !turn.timing) {
    return <p className="text-xs text-muted-foreground">{turn.status === 'pending'
      ? 'The measured steps arrive with the response.'
      : 'Detailed timing was not recorded for this turn.'}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Send → response ready. Each interval is counted once; the rows add up to the total.
        {result.complete
          ? ' Transport/proxy time combines the time around the Brain request. Provider time includes its network round trip.'
          : ' Some internal steps were not recorded; their time stays grouped below.'}
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
  );
}
