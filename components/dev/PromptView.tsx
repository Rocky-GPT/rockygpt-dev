'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { DevRuntime } from '@/lib/brain-dev-types';
import { copyText } from '@/lib/copy';
import { dollarsPerMillionTokens } from '@/lib/dev-format';

const INPUT_MEANINGS: Record<string, string> = {
  campus_now: 'The campus date and time for this turn, as a timestamp with its UTC offset.',
  client_omitted_messages: 'How many older messages the app did not send.',
  server_omitted_messages: 'How many older messages the Brain left out to fit.',
  graph_root: 'Ramapo and its available categories. Code follows the complete office path for each lookup.',
  earlier_messages:
    'The most recent earlier messages that fit, oldest first, each with its index among those kept.',
  latest_message: 'The student’s message.',
};

const DAY_MS = 86_400_000;

function daysUntil(validUntil: string): number | null {
  const time = Date.parse(validUntil);
  return Number.isNaN(time) ? null : (time - Date.now()) / DAY_MS;
}

export function PromptView({ runtime }: { runtime: DevRuntime }) {
  const { prompt, prices } = runtime;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const remaining = prices ? daysUntil(prices.valid_until) : null;

  async function copy() {
    setCopyState((await copyText(prompt)) ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 1500);
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
              Rates the Brain bills, per million tokens
            </h3>
            {dollarsPerMillionTokens(prices.input_nusd_per_token, runtime.nusdPerDollar) === null ? (
              <p className="mt-2 text-xs text-amber-300">
                Not shown: the Brain did not say what unit its prices are in.
              </p>
            ) : (
              <table className="mt-2 w-full text-left text-sm">
                <tbody className="divide-y divide-white/10">
                  <PriceRow label="Input" nusd={prices.input_nusd_per_token} unit={runtime.nusdPerDollar} />
                  <PriceRow
                    label="Cached input"
                    nusd={prices.cached_input_nusd_per_token}
                    unit={runtime.nusdPerDollar}
                  />
                  <PriceRow label="Output" nusd={prices.output_nusd_per_token} unit={runtime.nusdPerDollar} />
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Rates for <span className="font-mono">{prices.model}</span>, valid until{' '}
              <span className="font-mono">{prices.valid_until}</span>. The Brain&rsquo;s release notes
              call them conservative, so they are not necessarily the provider&rsquo;s list prices.
            </p>
            {remaining !== null && remaining <= 7 && (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
                {remaining < 0
                  ? 'That date has passed. The Brain refuses to call the model until the price release is renewed.'
                  : 'That date is within 7 days. After it, the Brain refuses to call the model until the price release is renewed.'}
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
            {copyState === 'copied' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy not available' : 'Copy'}
          </button>
        </div>
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-5 text-foreground/90">
          {prompt}
        </pre>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-foreground">The first message the model reads</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          These parts, in this order. The system prompt above and the tool definitions go with it,
          and office lookup results are added as the turn goes.
        </p>
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

function PriceRow({ label, nusd, unit }: { label: string; nusd: number; unit: number }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-xs text-muted-foreground">{label}</td>
      <td className="py-2 text-right font-mono text-foreground">{dollarsPerMillionTokens(nusd, unit)}</td>
    </tr>
  );
}
