'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import type { Turn } from './types';

export function TurnInspector({
  turn,
  onPrev,
  onNext,
}: {
  turn?: Turn;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!turn) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-xs text-sm leading-6 text-muted-foreground">
          Send a message to see the exact request and response here.
        </p>
      </div>
    );
  }

  const model = typeof turn.raw?.model === 'string' ? turn.raw.model : undefined;
  const answer = typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined;
  const shuttleFact = isRecord(turn.raw?.shuttleFact) ? turn.raw.shuttleFact : undefined;

  const copyRaw = () => {
    void navigator.clipboard.writeText(
      `Request\n${turn.requestText}\n\nResponse\n${turn.rawText ?? ''}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-3 border-b border-border bg-neutral-900/60 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">{turn.question}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {turn.httpStatus ? `HTTP ${turn.httpStatus}` : 'Pending'}
            {turn.latencyMs !== undefined ? ` · ${turn.latencyMs} ms` : ''}
            {model ? ` · ${model}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copyRaw}
            title="Copy raw request and response"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
          <StepButton title="Previous turn" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </StepButton>
          <StepButton title="Next turn" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </StepButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <RawPanel title="REQUEST" text={turn.requestText} />
        {shuttleFact && <ShuttleFactPanel fact={shuttleFact} />}
        {answer ? (
          <ResponsePanel answer={answer} rawText={turn.rawText ?? ''} />
        ) : (
          <RawPanel title="RESPONSE" text={turn.rawText ?? 'Waiting for response…'} />
        )}
      </div>
    </div>
  );
}

function ShuttleFactPanel({ fact }: { fact: Record<string, unknown> }) {
  const departureTime = typeof fact.departureTime === 'string' ? fact.departureTime : 'Unknown';
  const departureAt = typeof fact.departureAt === 'string' ? fact.departureAt : undefined;
  const origin = typeof fact.origin === 'string' ? fact.origin : undefined;
  const service = typeof fact.service === 'string' ? fact.service : undefined;
  const sourceTitle = typeof fact.sourceTitle === 'string' ? fact.sourceTitle : 'Official source';
  const sourceUrl = typeof fact.sourceUrl === 'string' ? fact.sourceUrl : undefined;
  const checkedAt = typeof fact.sourceCheckedAt === 'string' ? fact.sourceCheckedAt : undefined;

  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          SHUTTLE FACT
        </h2>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
          deterministic_schedule_lookup
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-border bg-neutral-950/70 p-4">
        <p className="text-xl font-semibold text-foreground">{departureTime}</p>
        {service && <p className="mt-1 text-sm text-muted-foreground">{service}</p>}
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          {origin && <FactRow label="Origin" value={origin} />}
          {departureAt && <FactRow label="Departure" value={departureAt} />}
          {checkedAt && <FactRow label="Source checked" value={checkedAt} />}
          <div>
            <dt className="text-muted-foreground">Trusted source</dt>
            <dd className="mt-0.5 break-words text-foreground">
              {sourceUrl ? (
                <a className="text-sky-300 underline underline-offset-2" href={sourceUrl}>
                  {sourceTitle}
                </a>
              ) : (
                sourceTitle
              )}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-mono text-foreground">{value}</dd>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function ResponsePanel({ answer, rawText }: { answer: string; rawText: string }) {
  return (
    <section className="border-b border-border px-5 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
        RESPONSE
      </h2>
      <div className="mt-3 rounded-xl border border-border bg-neutral-950/70 p-4 text-[15px] leading-7 text-foreground">
        <BrainMarkdown>{answer}</BrainMarkdown>
      </div>
      <details className="mt-3 rounded-lg border border-border bg-neutral-950/40 px-3 py-2">
        <summary className="cursor-pointer font-mono text-[11px] text-muted-foreground">
          Raw JSON
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
          {rawText}
        </pre>
      </details>
    </section>
  );
}

function RawPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="border-b border-border px-5 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">{title}</h2>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-neutral-950/70 p-3 font-mono text-xs leading-5 text-foreground">
        {text}
      </pre>
    </section>
  );
}

function StepButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={title}
      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
