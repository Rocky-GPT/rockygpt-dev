'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { DevRuntime } from '@/lib/brain-dev-types';

const INPUT_MEANINGS: Record<string, string> = {
  campus_now: 'The turn’s campus clock.',
  client_omitted_messages: 'Older messages the app did not send.',
  server_omitted_messages: 'Older messages the Brain cut to fit.',
  published_offices: 'Every published office with its aliases.',
  earlier_messages: 'The conversation so far, oldest first, with each message’s index.',
  latest_message: 'The student’s message.',
};

const DAY_MS = 86_400_000;

function daysUntil(validUntil: string): number | null {
  const time = Date.parse(validUntil);
  return Number.isNaN(time) ? null : (time - Date.now()) / DAY_MS;
}

function dollarsPerMillion(nusdPerToken: number): string {
  return `$${(nusdPerToken / 1000).toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
}

export function PromptView({ runtime }: { runtime: DevRuntime }) {
  const { prompt, prices } = runtime;
  const [copied, setCopied] = useState(false);
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const remaining = prices ? daysUntil(prices.valid_until) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-foreground">Model</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Model" value={runtime.model ?? 'Not reported'} />
          <Field label="Environment" value={runtime.environment ?? 'Not reported'} />
        </dl>

        {prices ? (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Price per million tokens
            </h3>
            <table className="mt-2 w-full text-left text-sm">
              <tbody className="divide-y divide-white/10">
                <PriceRow label="Input" nusd={prices.input_nusd_per_token} />
                <PriceRow label="Cached input" nusd={prices.cached_input_nusd_per_token} />
                <PriceRow label="Output" nusd={prices.output_nusd_per_token} />
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Prices are for <span className="font-mono">{prices.model}</span> and valid until{' '}
              <span className="font-mono">{prices.valid_until}</span>.
            </p>
            {remaining !== null && remaining <= 7 && (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
                {remaining < 0
                  ? 'These prices are past their valid-until date. Costs may be off.'
                  : 'These prices stop being valid within 7 days.'}
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">The Brain reported no price table.</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">The prompt</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {prompt.length.toLocaleString('en-US')} characters, {words.toLocaleString('en-US')} words
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-5 text-foreground/90">
          {prompt}
        </pre>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-foreground">What the model is given each turn</h2>
        <table className="mt-3 w-full text-left text-sm">
          <tbody className="divide-y divide-white/10">
            {runtime.modelInputKeys.map((key) => (
              <tr key={key}>
                <td className="py-2 pr-4 align-top font-mono text-xs text-foreground">{key}</td>
                <td className="py-2 text-xs text-muted-foreground">
                  {INPUT_MEANINGS[key] ?? 'no description'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function PriceRow({ label, nusd }: { label: string; nusd: number }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{label}</td>
      <td className="py-2 text-right font-mono text-foreground">{dollarsPerMillion(nusd)}</td>
    </tr>
  );
}
