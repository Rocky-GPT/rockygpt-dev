'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { JsonViewer } from '@/components/JsonViewer';
import { SourcesPanel } from './SourcesPanel';
import { LookupsTab, PacketTab, TONE, TimingTab, formatMs } from './TraceView';
import { useNow } from './useNow';
import { useAskSession } from './AskSession';
import { shownTab } from '@/lib/inspector-tabs';
import { turnTabs } from './turnTabs';
import type { Turn } from './types';

/**
 * One turn, read top to bottom: a header that says how it went at a glance,
 * then tabs for the answer, how it got there and the raw bytes. The tab you pick stays picked as you step between turns, so
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
  const { inspectorTab: tab, setInspectorTab: setTab } = useAskSession();
  const tabBar = useRef<HTMLDivElement>(null);
  const turnId = turn?.localId;
  // The arrow keys can step to a tab that is scrolled out of the bar.
  useEffect(() => {
    tabBar.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab, turnId]);

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
  const tabs = turnTabs(turn);
  const shown = shownTab(tabs, tab);

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
        <Summary turn={turn} />
        <div
          ref={tabBar}
          role="tablist"
          aria-label="Turn details"
          title="Left and right arrow keys switch tabs"
          className="mt-3 flex gap-1 overflow-x-auto px-3"
        >
          {tabs.map((item) => {
            const selected = shown === item.id;
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
        {shown === 'answer' && <AnswerTab turn={turn} />}
        {shown === 'sources' &&
          (citations.length > 0 ? (
            <SourcesPanel citations={citations} />
          ) : (
            <Placeholder>
              {live ? 'Sources arrive with the answer.' : 'This answer cites no sources.'}
            </Placeholder>
          ))}
        {shown === 'packet' && <PacketTab turn={turn} />}
        {shown === 'lookups' && <LookupsTab turn={turn} />}
        {shown === 'timing' && <TimingTab turn={turn} />}
        {shown === 'raw' && <RawTab turn={turn} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Header */

/** The turn at a glance: how it came out, how long it took, and who answered. */
function Summary({ turn }: { turn: Turn }) {
  const model = typeof turn.raw?.model === 'string' ? turn.raw.model : undefined;

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
      {model && (
        <Pill className="border-white/10 bg-white/[0.04] font-mono text-muted-foreground">
          {model}
        </Pill>
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
  if (turn.status === 'pending') return <LiveAnswer />;
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
  if (turn.status === 'not_built') return <NotBuiltPanel />;
  return (
    <div className="px-5 py-4">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-neutral-950/70 p-3 font-mono text-xs leading-5 text-foreground">
        {turn.rawText ?? 'No response body.'}
      </pre>
    </div>
  );
}

/** The Brain sends one answer at the end, so a turn in flight only shows that it is waiting. */
function LiveAnswer() {
  return (
    <div className="px-5 py-4">
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-border bg-neutral-950/70 px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-300" />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">Sending the question…</p>
        </div>
      </div>
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

/** The Brain answered "not ready": nothing broke, the step for this question isn't built. */
function NotBuiltPanel() {
  return (
    <div className="px-5 py-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-base font-semibold text-foreground">Not built yet</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The Brain answered &quot;not ready&quot;: the step for this question isn&apos;t built yet.
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
