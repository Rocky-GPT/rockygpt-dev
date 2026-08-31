'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
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
        <RawPanel title="RESPONSE" text={turn.rawText ?? 'Waiting for response…'} />
      </div>
    </div>
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
