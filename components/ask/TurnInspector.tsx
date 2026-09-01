'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { assessStep5Response } from '@/lib/step-5-response-check';
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
  const transportationInterpretation = isRecord(turn.raw?.transportationInterpretation)
    ? turn.raw.transportationInterpretation
    : undefined;
  const transportationResult = isRecord(turn.raw?.transportationResult)
    ? turn.raw.transportationResult
    : undefined;
  const transportationProvenance = isRecord(turn.raw?.transportationProvenance)
    ? turn.raw.transportationProvenance
    : undefined;
  const assessment = assessStep5Response(turn);
  const statusLabel =
    turn.status === 'ok'
      ? 'Answered'
      : turn.status === 'declined'
        ? 'Declined'
        : turn.status === 'failed'
          ? 'Failed'
          : 'Pending';

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
            {statusLabel}
            {turn.httpStatus ? ` · HTTP ${turn.httpStatus}` : ''}
            {turn.latencyMs !== undefined ? ` · ${turn.latencyMs} ms` : ''}
            {model ? ` · ${model}` : ''}
            {turn.requestId ? ` · request ${turn.requestId}` : ''}
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
        {assessment && <ResponseChecksPanel assessment={assessment} />}
        <RequestConversationPanel messages={turn.request.messages} />
        {transportationInterpretation && (
          <TransportationInterpretationPanel interpretation={transportationInterpretation} />
        )}
        {transportationResult && (
          <StructuredInspectionPanel
            title="Deterministic transportation result"
            value={transportationResult}
            badge={
              typeof transportationResult.outcome === 'string'
                ? humanizeIdentifier(transportationResult.outcome)
                : undefined
            }
          />
        )}
        {transportationProvenance && (
          <StructuredInspectionPanel
            title="Trusted source / provenance"
            value={transportationProvenance}
            badge="Trusted database"
          />
        )}
        {answer ? (
          <ResponsePanel answer={answer} />
        ) : turn.status === 'failed' ? (
          <FailurePanel turn={turn} />
        ) : (
          <RawPanel title="RESPONSE" text={turn.rawText ?? 'Waiting for response…'} />
        )}
      </div>
    </div>
  );
}

function ResponseChecksPanel({
  assessment,
}: {
  assessment: NonNullable<ReturnType<typeof assessStep5Response>>;
}) {
  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          Response checks
        </h2>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
            assessment.passed
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {assessment.passed ? 'Passed' : 'Failed'}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {assessment.assertions.map((assertion) => (
          <li
            key={assertion.label}
            className={assertion.passed ? 'text-muted-foreground' : 'text-red-300'}
          >
            {assertion.passed ? '✓' : '✕'} {assertion.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StructuredInspectionPanel({
  title,
  value,
  badge,
}: {
  title: string;
  value: Record<string, unknown>;
  badge?: string;
}) {
  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          {title}
        </h2>
        {badge && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
            {badge}
          </span>
        )}
      </div>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-neutral-950/70 p-4 font-mono text-xs leading-5 text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function TransportationInterpretationPanel({
  interpretation,
}: {
  interpretation: Record<string, unknown>;
}) {
  const selected = interpretation.selected === true;
  const model = typeof interpretation.model === 'string' ? interpretation.model : undefined;
  const request = isRecord(interpretation.request) ? interpretation.request : undefined;
  const kind = typeof request?.kind === 'string' ? request.kind : undefined;

  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          Transportation interpretation
        </h2>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
            selected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-white/10 bg-white/[0.04] text-muted-foreground'
          }`}
        >
          {selected ? (kind ? humanizeIdentifier(kind) : 'Selected') : 'Not selected'}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-border bg-neutral-950/70 p-4">
        {model && <p className="mb-3 text-xs text-muted-foreground">Interpreted by {model}</p>}
        {request ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
            {JSON.stringify(request, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            The model did not select the shuttle capability for this request.
          </p>
        )}
      </div>
    </section>
  );
}

function RequestConversationPanel({ messages }: { messages: Turn['request']['messages'] }) {
  return (
    <section className="border-b border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
          Request conversation
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-3 max-h-96 space-y-2 overflow-y-auto rounded-xl border border-border bg-neutral-950/40 p-3">
        {messages.map((message, index) => {
          const user = message.role === 'user';
          return (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-lg border px-3 py-2.5 ${
                user
                  ? 'border-sky-500/20 bg-sky-500/10'
                  : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <p
                className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
                  user ? 'text-sky-300' : 'text-emerald-300'
                }`}
              >
                {user ? 'User' : 'RockyGPT'}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                {message.content}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ResponsePanel({ answer }: { answer: string }) {
  return (
    <section className="border-b border-border px-5 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
        RESPONSE
      </h2>
      <div className="mt-3 rounded-xl border border-border bg-neutral-950/70 p-4 text-[15px] leading-7 text-foreground">
        <BrainMarkdown>{answer}</BrainMarkdown>
      </div>
    </section>
  );
}

function FailurePanel({ turn }: { turn: Turn }) {
  const reason = typeof turn.raw?.reason === 'string' ? turn.raw.reason : undefined;
  const errorMessage = typeof turn.raw?.error === 'string' ? turn.raw.error : undefined;
  const detailMessage = typeof turn.raw?.detail === 'string' ? turn.raw.detail : undefined;
  const message =
    errorMessage ?? detailMessage ?? turn.failure ?? 'The request failed before a response was received.';
  const detail = errorMessage ? detailMessage : undefined;
  const retryable = typeof turn.raw?.retryable === 'boolean' ? turn.raw.retryable : undefined;
  const timeoutMs = typeof turn.raw?.timeoutMs === 'number' ? turn.raw.timeoutMs : undefined;
  const heading =
    reason === 'timeout'
      ? 'Brain response timed out'
      : reason === 'unreachable'
        ? 'Brain connection failed'
        : reason === 'misconfigured'
          ? 'Brain is not configured'
          : reason === 'cancelled'
            ? 'Request stopped'
            : reason === 'client_network_error'
              ? 'Browser request failed'
            : 'Brain request failed';

  return (
    <section className="border-b border-border px-5 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-red-300">ERROR</h2>
      <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
        <p className="text-base font-semibold text-red-200">{heading}</p>
        <p className="mt-2 text-sm leading-6 text-foreground">{message}</p>
        {detail && <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {turn.httpStatus !== undefined && (
            <FailureDetail label="HTTP status" value={String(turn.httpStatus)} />
          )}
          {reason && <FailureDetail label="Reason" value={humanizeIdentifier(reason)} />}
          {timeoutMs !== undefined && (
            <FailureDetail label="Timeout" value={`${timeoutMs / 1_000} seconds`} />
          )}
          {retryable !== undefined && (
            <FailureDetail label="Retryable" value={retryable ? 'Yes' : 'No'} />
          )}
        </dl>
      </div>
      {turn.rawText && (
        <details className="mt-3 rounded-xl border border-border bg-neutral-950/50">
          <summary className="cursor-pointer px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground">
            Raw response
          </summary>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-border p-3 font-mono text-xs leading-5 text-foreground">
            {turn.rawText}
          </pre>
        </details>
      )}
    </section>
  );
}

function FailureDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-foreground">{value}</dd>
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
