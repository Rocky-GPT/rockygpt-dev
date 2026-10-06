import type { DevRuntime } from '@/lib/brain-dev-types';
import { formatSpend } from '@/lib/dev-format';

function count(value: number | null, unit: string): string {
  return value === null ? 'Not reported' : `${value.toLocaleString('en-US')} ${unit}`;
}

export function ConfigView({ runtime }: { runtime: DevRuntime }) {
  const { limits } = runtime;
  const spendCap =
    formatSpend(limits.maxTurnNusd, runtime.nusdPerDollar) ??
    'Not shown: the Brain did not say what unit its prices are in';

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile label="Environment" value={runtime.environment ?? 'Not reported'} />
        <Tile label="Model" value={runtime.model ?? 'Not reported'} />
      </div>

      <Table
        title="Per question"
        rows={[
          ['Time allowed', `${limits.turnSeconds.toLocaleString('en-US')} seconds`],
          ['Spend cap', spendCap],
          ['Model calls', limits.maxModelCalls.toLocaleString('en-US')],
          ['Answer length', count(limits.maxAnswerChars, 'characters')],
        ]}
      />

      <Table
        title="Per model call"
        note="Each call is checked on its own, so a question that makes several calls can use more than this in total."
        rows={[
          ['Largest request sent to the model', count(limits.maxInputBytes, 'bytes')],
          ['Most tokens the model may write', count(limits.maxOutputTokens, 'tokens')],
        ]}
      />

      <Table
        title="Office lookups"
        rows={[
          ['Office lookups allowed', limits.maxToolAttempts.toLocaleString('en-US')],
          ['Office results kept', limits.maxLookupResults.toLocaleString('en-US')],
        ]}
      />

      <Table
        title="What a request may contain"
        rows={[
          ['Messages', limits.maxMessages.toLocaleString('en-US')],
          ['Characters per message', limits.maxMessageChars.toLocaleString('en-US')],
          ['Characters in the whole conversation', limits.maxConversationChars.toLocaleString('en-US')],
          ['History the Brain keeps, at most', count(limits.maxHistoryBytes, 'bytes')],
        ]}
      />

      <p className="text-xs text-muted-foreground">
        The monthly allowance and spend live in the Brain&rsquo;s ledger and are not shown here.
      </p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Table({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: Array<[string, string]>;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <table className="mt-3 w-full text-left text-sm">
        <tbody className="divide-y divide-white/10">
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="py-2 pr-4 text-xs text-muted-foreground">{label}</td>
              <td className="py-2 text-right font-mono text-foreground">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
