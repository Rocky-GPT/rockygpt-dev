'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { describeStep, type TurnStep } from '@/lib/chat-stream';
import { SourcesPanel } from './SourcesPanel';
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
  const responseStatus = typeof turn.raw?.status === 'string' ? turn.raw.status : undefined;
  const datasetVersion = typeof turn.raw?.datasetVersion === 'string' ? turn.raw.datasetVersion : undefined;
  const statusLabel =
    turn.status === 'ok'
      ? 'Answered'
      : turn.status === 'declined'
        ? 'Declined'
        : turn.status === 'failed'
          ? 'Failed'
          : 'Working';

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
            {responseStatus ? humanizeIdentifier(responseStatus) : statusLabel}
            {turn.httpStatus ? ` · HTTP ${turn.httpStatus}` : ''}
            {turn.latencyMs !== undefined ? ` · ${turn.latencyMs} ms` : ''}
            {model ? ` · ${model}` : ''}
            {datasetVersion ? ` · dataset ${datasetVersion}` : ''}
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
        <RequestConversationPanel messages={turn.request.messages} />
        {answer ? (
          <ResponsePanel answer={answer} />
        ) : turn.status === 'failed' ? (
          <FailurePanel turn={turn} />
        ) : turn.status === 'pending' ? (
          <LiveResponsePanel turn={turn} />
        ) : (
          <RawPanel title="RESPONSE" text={turn.rawText ?? 'No response body.'} />
        )}
        {Array.isArray(turn.raw?.citations) && turn.raw.citations.length > 0 && (
          <SourcesPanel citations={turn.raw.citations} />
        )}
        {Array.isArray(turn.raw?.trace) && turn.raw.trace.length > 0 && (
          <RawPanel title="TOOL CALLS" text={JSON.stringify(turn.raw.trace, null, 2)} />
        )}
        {turn.steps && turn.steps.length > 0 && (
          <StepsPanel
            steps={turn.steps}
            live={turn.status === 'pending'}
            totalMs={turn.latencyMs}
          />
        )}
        {answer && turn.rawText && (
          <details>
            <summary className="cursor-pointer px-5 py-3 text-xs text-muted-foreground">
              Complete response JSON
            </summary>
            <RawPanel title="RESPONSE" text={turn.rawText} />
          </details>
        )}
      </div>
    </div>
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

/** Seconds since `startedAt`, ticking while the turn is in flight. */
function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1_000));
}

/**
 * What the Brain is doing right now, from the steps it has sent so far, then
 * its draft once there is one to check. The draft is drawn apart from a real
 * answer on purpose: the check can still cut it.
 */
function LiveResponsePanel({ turn }: { turn: Turn }) {
  const elapsed = useElapsedSeconds(turn.startedAt);
  const step = turn.steps?.[turn.steps.length - 1];
  const { label, detail } = step ? describeStep(step) : { label: 'Sending the question' };

  return (
    <section className="border-b border-border px-5 py-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
        RESPONSE
      </h2>
      <div
        role="status"
        aria-live="polite"
        className="mt-3 rounded-xl border border-border bg-neutral-950/70 px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-300" />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">{label}…</p>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{elapsed} s</span>
        </div>
        {detail && (
          <p className="mt-1 truncate pl-6.5 text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      {turn.draft && (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
            Draft · not checked yet
          </p>
          <div className="text-[15px] leading-7 text-muted-foreground">
            <BrainMarkdown>{turn.draft}</BrainMarkdown>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Every stage the Brain reported, with when it started. Open while the turn
 * runs, folded away once the answer is in.
 */
function StepsPanel({
  steps,
  live,
  totalMs,
}: {
  steps: TurnStep[];
  live: boolean;
  totalMs?: number;
}) {
  const list = (
    <ol className="mt-3 space-y-1.5 rounded-xl border border-border bg-neutral-950/40 p-3">
      {steps.map((step, index) => {
        const { label, detail } = describeStep(step);
        const running = live && index === steps.length - 1;
        return (
          <li key={`${step.stage}-${index}`} className="flex items-start gap-2.5 text-sm">
            <span className="mt-1 shrink-0">
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />
              ) : (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={running ? 'text-foreground' : 'text-muted-foreground'}>
                {label}
              </span>
              {detail && (
                <span className="block text-xs leading-5 text-muted-foreground">{detail}</span>
              )}
            </span>
            <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
              {(step.atMs / 1_000).toFixed(1)} s
            </span>
          </li>
        );
      })}
    </ol>
  );

  if (live) {
    return (
      <section className="border-b border-border px-5 py-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">STEPS</h2>
        {list}
      </section>
    );
  }

  return (
    <details className="border-b border-border px-5 py-3">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Steps · {steps.length}
        {totalMs !== undefined ? ` · ${(totalMs / 1_000).toFixed(1)} s total` : ''}
      </summary>
      {list}
    </details>
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
            : reason === 'stream_interrupted'
              ? 'Brain stopped mid-answer'
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
