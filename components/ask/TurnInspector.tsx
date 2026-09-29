'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { JsonViewer } from '@/components/JsonViewer';
import { describeStep } from '@/lib/chat-stream';
import { readJevRoute } from '@/lib/jev-route';
import { SourcesPanel } from './SourcesPanel';
import { LiveStepBar, TONE, TraceView, formatMs, readRouting, summarizeRouting } from './TraceView';
import { useNow } from './useNow';
import type { Turn } from './types';

type Tab = 'answer' | 'sources' | 'trace' | 'request' | 'raw';

/**
 * One turn, read top to bottom: a header that says how it went at a glance,
 * then tabs for the answer, its sources, how it got there, what was sent, and
 * the raw bytes. The tab you pick stays picked as you step between turns, so
 * comparing the same view across a run is one click per turn.
 */
export function TurnInspector({
  turn,
  onPrev,
  onNext,
}: {
  turn?: Turn;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('answer');

  if (!turn) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-xs text-sm leading-6 text-muted-foreground">
          Send a message to see the exact request and response here.
        </p>
      </div>
    );
  }

  const live = turn.status === 'pending';
  const citations = Array.isArray(turn.raw?.citations) ? turn.raw.citations : [];
  const calls = Array.isArray(turn.raw?.trace) ? turn.raw.trace.length : 0;
  const tabs: Array<{ id: Tab; label: string; count?: number | string }> = [
    { id: 'answer', label: 'Answer' },
    { id: 'sources', label: 'Sources', count: live ? undefined : citations.length },
    {
      id: 'trace',
      label: 'Trace',
      count: live ? undefined : calls ? `${calls} tool${calls === 1 ? '' : 's'}` : undefined,
    },
    { id: 'request', label: 'Request', count: turn.request.messages.length },
    { id: 'raw', label: 'Raw' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-neutral-900/60">
        <div className="flex items-start gap-3 px-5 pt-3.5">
          <p className="line-clamp-2 min-w-0 flex-1 text-[15px] font-medium leading-6 text-foreground">
            {turn.question}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <CopyButton
              title="Copy raw request and response"
              text={() => `Request\n${turn.requestText}\n\nResponse\n${turn.rawText ?? ''}`}
            />
            <IconButton title="Previous turn" onClick={onPrev}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton title="Next turn" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <Summary turn={turn} onOpenTrace={() => setTab('trace')} />
        <div
          role="tablist"
          aria-label="Turn details"
          className="mt-3 flex gap-1 overflow-x-auto px-3"
        >
          {tabs.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-sky-400 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
                {item.id === 'answer' && live && (
                  <Loader2 className="h-3 w-3 animate-spin text-sky-300" />
                )}
                {item.count !== undefined && (
                  <span className="rounded bg-white/[0.06] px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {tab === 'answer' && <AnswerTab turn={turn} />}
        {tab === 'sources' &&
          (citations.length > 0 ? (
            <SourcesPanel citations={citations} />
          ) : (
            <Placeholder>
              {live ? 'Sources arrive with the answer.' : 'This answer cites no sources.'}
            </Placeholder>
          ))}
        {tab === 'trace' && <TraceView turn={turn} />}
        {tab === 'request' && <RequestTab messages={turn.request.messages} />}
        {tab === 'raw' && <RawTab turn={turn} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Header */

/** The turn at a glance: how it came out, how long it took, who answered, and what Jev did. */
function Summary({ turn, onOpenTrace }: { turn: Turn; onOpenTrace: () => void }) {
  const model = typeof turn.raw?.model === 'string' ? turn.raw.model : undefined;
  const routing = readRouting((turn.raw?.metrics as Record<string, unknown> | undefined)?.routing);
  const jev = routing ? summarizeRouting(routing) : undefined;
  const route = readJevRoute(turn.raw);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 px-5">
      <StatusPill turn={turn} />
      {turn.latencyMs !== undefined && <Pill>{formatMs(turn.latencyMs)}</Pill>}
      {turn.httpStatus !== undefined && (turn.httpStatus < 200 || turn.httpStatus >= 300) && (
        <Pill
          className={
            turn.status === 'not_built'
              ? TONE.neutral
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }
        >
          HTTP {turn.httpStatus}
        </Pill>
      )}
      {route && (
        <Pill className={TONE.info}>
          <span title="The route Jev picked for this question">{route.label}</span>
        </Pill>
      )}
      {route && route.lowConfidence.length > 0 && (
        <Pill className={TONE.attention}>
          <span title="Jev was under 90% sure of these picks; the Brain still followed them">
            under 90%: {route.lowConfidence.map((low) => `${low.pick} ${low.percent}%`).join(', ')}
          </span>
        </Pill>
      )}
      {model && (
        <Pill className="border-white/10 bg-white/[0.04] font-mono text-muted-foreground">
          {model}
        </Pill>
      )}
      {jev && (
        <button
          type="button"
          onClick={onOpenTrace}
          title={jev.sentence}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${TONE[jev.tone]}`}
        >
          {jev.short}
        </button>
      )}
      {turn.requestId && <RequestId id={turn.requestId} />}
    </div>
  );
}

function StatusPill({ turn }: { turn: Turn }) {
  const now = useNow(turn.status === 'pending' ? 1_000 : null);
  if (turn.status === 'pending') {
    const seconds = Math.max(0, Math.floor((now - turn.startedAt) / 1_000));
    return (
      <Pill className="border-sky-500/30 bg-sky-500/10 text-sky-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Working · {seconds} s
      </Pill>
    );
  }
  // The Brain's own verdict when it gave one: a 200 can still be "partial"
  // or "unavailable", and that is not the same green as a full answer.
  const verdict = typeof turn.raw?.status === 'string' ? turn.raw.status : undefined;
  const label =
    turn.status === 'failed'
      ? 'Failed'
      : turn.status === 'not_built'
        ? 'Not built yet'
        : verdict
          ? humanizeIdentifier(verdict)
          : turn.status === 'declined'
            ? 'Declined'
            : 'Answered';
  const tone =
    turn.status === 'failed'
      ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : turn.status === 'not_built'
        ? TONE.neutral
        : turn.status === 'declined' || (verdict && verdict !== 'answered')
          ? TONE.attention
          : TONE.positive;
  return <Pill className={tone}>{label}</Pill>;
}

function RequestId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy request id"
      onClick={() => {
        void navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-auto flex max-w-[14rem] items-center gap-1 truncate font-mono text-[10px] text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : null}
      <span className="truncate">{id}</span>
    </button>
  );
}

/* --------------------------------------------------------------- Answer */

function AnswerTab({ turn }: { turn: Turn }) {
  const answer = typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined;
  if (turn.status === 'pending') return <LiveAnswer turn={turn} />;
  if (answer) {
    return (
      <div className="px-5 py-4">
        <div className="rounded-xl border border-border bg-neutral-950/70 p-4 text-[15px] leading-7 text-foreground">
          <BrainMarkdown>{answer}</BrainMarkdown>
        </div>
      </div>
    );
  }
  if (turn.status === 'failed') return <FailurePanel turn={turn} />;
  if (turn.status === 'not_built') return <NotBuiltPanel turn={turn} />;
  return (
    <div className="px-5 py-4">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-neutral-950/70 p-3 font-mono text-xs leading-5 text-foreground">
        {turn.rawText ?? 'No response body.'}
      </pre>
    </div>
  );
}

/**
 * What the Brain is doing right now, from the steps it has sent so far, then
 * its draft once there is one to check. The draft is drawn apart from a real
 * answer on purpose: the check can still cut it.
 */
function LiveAnswer({ turn }: { turn: Turn }) {
  const step = turn.steps?.[turn.steps.length - 1];
  const { label, detail } = step ? describeStep(step) : { label: 'Sending the question' };

  return (
    <div className="px-5 py-4">
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-border bg-neutral-950/70 px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-300" />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">{label}…</p>
        </div>
        {detail && <p className="mt-1 truncate pl-6.5 text-xs text-muted-foreground">{detail}</p>}
        {turn.steps && turn.steps.length > 0 && (
          <div className="mt-3">
            <LiveStepBar steps={turn.steps} startedAt={turn.startedAt} />
          </div>
        )}
      </div>
      {turn.safety && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-300/80">
            Emergency guidance · sent at {turn.safety.atMs} ms
          </p>
          <div className="text-[15px] leading-7 text-foreground">
            <BrainMarkdown>{turn.safety.answer}</BrainMarkdown>
          </div>
        </div>
      )}
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
    </div>
  );
}

function FailurePanel({ turn }: { turn: Turn }) {
  const reason = typeof turn.raw?.reason === 'string' ? turn.raw.reason : undefined;
  const errorMessage = typeof turn.raw?.error === 'string' ? turn.raw.error : undefined;
  const detailMessage = typeof turn.raw?.detail === 'string' ? turn.raw.detail : undefined;
  const message =
    errorMessage ??
    detailMessage ??
    turn.failure ??
    'The request failed before a response was received.';
  const detail = errorMessage ? detailMessage : undefined;
  const retryable = typeof turn.raw?.retryable === 'boolean' ? turn.raw.retryable : undefined;
  const timeoutMs = typeof turn.raw?.timeoutMs === 'number' ? turn.raw.timeoutMs : undefined;
  const heading =
    reason === 'timeout' || reason === 'model_timeout'
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
    <div className="px-5 py-4">
      <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
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
    </div>
  );
}

/** The new Brain picked a route whose step isn't built yet: nothing broke. */
function NotBuiltPanel({ turn }: { turn: Turn }) {
  const route = readJevRoute(turn.raw);
  return (
    <div className="px-5 py-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-base font-semibold text-foreground">Not built yet</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {route
            ? `Jev sent this question to ${route.label}. That step comes with a later milestone, so the Brain answered "not ready".`
            : 'The Brain answered "not ready": the step for this question comes with a later milestone.'}
        </p>
      </div>
    </div>
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

/* -------------------------------------------------------------- Request */

function RequestTab({ messages }: { messages: Turn['request']['messages'] }) {
  return (
    <div className="space-y-2 px-5 py-4">
      <p className="text-xs text-muted-foreground">
        {messages.length} message{messages.length === 1 ? '' : 's'} sent, oldest first. The last one
        is the question.
      </p>
      {messages.map((message, index) => {
        const user = message.role === 'user';
        return (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg border px-3 py-2.5 ${
              user ? 'border-sky-500/20 bg-sky-500/10' : 'border-white/10 bg-white/[0.04]'
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
  );
}

/* ------------------------------------------------------------------ Raw */

function RawTab({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-4 px-5 py-4">
      <div className="overflow-hidden rounded-xl border border-border">
        <JsonViewer
          data={turn.request}
          title="Request · POST /v1/chat"
          alwaysOpen
          className="border-t-0"
        />
      </div>
      {turn.raw ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <JsonViewer data={turn.raw} title="Response" alwaysOpen className="border-t-0" />
        </div>
      ) : turn.rawText ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-neutral-950/70 p-3 font-mono text-xs leading-5 text-foreground">
          {turn.rawText}
        </pre>
      ) : (
        <Placeholder>The response is not in yet.</Placeholder>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Helpers */

function humanizeIdentifier(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function Pill({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
        className || 'border-white/10 bg-white/[0.04] text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function CopyButton({ title, text }: { title: string; text: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      title={title}
      onClick={() => {
        void navigator.clipboard.writeText(text());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </IconButton>
  );
}

function IconButton({
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
      aria-label={title}
      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
