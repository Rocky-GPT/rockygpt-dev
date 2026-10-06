import type { DevRuntime } from '@/lib/brain-dev-types';

const NUSD_PER_DOLLAR = 1e9;

function count(value: number | null, unit: string): string {
  return value === null ? 'Not reported' : `${value.toLocaleString('en-US')} ${unit}`;
}

export function ConfigView({ runtime }: { runtime: DevRuntime }) {
  const { limits } = runtime;
  const spendCap = limits.maxTurnNusd / NUSD_PER_DOLLAR;

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
          ['Spend cap', `$${spendCap.toLocaleString('en-US', { maximumFractionDigits: 9 })}`],
          ['Model calls', limits.maxModelCalls.toLocaleString('en-US')],
          ['Lookup attempts', limits.maxToolAttempts.toLocaleString('en-US')],
          ['Lookup results', limits.maxLookupResults.toLocaleString('en-US')],
          ['Answer length', count(limits.maxAnswerChars, 'characters')],
          ['Model input', count(limits.maxInputBytes, 'bytes')],
          ['Model output', count(limits.maxOutputTokens, 'tokens')],
        ]}
      />

      <Table
        title="What a request may contain"
        rows={[
          ['Messages', limits.maxMessages.toLocaleString('en-US')],
          ['Characters per message', limits.maxMessageChars.toLocaleString('en-US')],
          ['Characters in the whole conversation', limits.maxConversationChars.toLocaleString('en-US')],
          ['Bytes of history the Brain keeps', limits.maxHistoryBytes.toLocaleString('en-US')],
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

function Table({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
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
