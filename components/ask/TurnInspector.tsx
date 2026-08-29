'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Sparkles } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { JsonViewer } from '@/components/JsonViewer';
import { BOOKKEEPING, modeChips, recordValue, STAGES, turnPipeline } from '@/lib/turn-pipeline';

interface TurnInspectorProps {
  /** The response body exactly as received. Undefined before the first turn. */
  payload?: Record<string, unknown>;
  /** Stands in only for an error turn, whose body carries no trace. */
  question?: string;
  /** Drives the step animation and remounts the stack between turns. */
  requestId?: string;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * A turn, stage by stage.
 *
 * The student app draws this in a modal, which is right there and wrong here.
 * There, chat is the content and the JSON is an aside you open; here the JSON
 * *is* the content, and putting a click in front of it is a step with no
 * decision in it. Three things follow from being a panel rather than a dialog:
 *
 *   - No `useAccessibleDialog`. That hook installs a Tab focus trap, and a
 *     permanently-open trap is a trap you can never leave — with a composer on
 *     the same screen it would be a keyboard dead end rather than a nicety.
 *   - No overlay. `MODAL_OVERLAY` is `fixed inset-0`, which cannot sit beside
 *     anything.
 *   - Arrow keys are bound to this element, not to `document`. The dialog could
 *     claim them outright because nothing behind it took text; a composer does,
 *     and a global handler calling `preventDefault` would eat caret movement.
 */
export function TurnInspector({
  payload,
  question,
  requestId,
  onPrev,
  onNext,
}: TurnInspectorProps) {
  const [copied, setCopied] = useState(false);
  // Which way the last step went, so the incoming turn enters from the side you
  // came from. Null on first render, when there is no direction to imply.
  const [came, setCame] = useState<'next' | 'prev' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const forward = event.key === 'ArrowRight';
      const step = forward ? onNext : event.key === 'ArrowLeft' ? onPrev : null;
      if (!step) return;
      event.preventDefault();
      setCopied(false);
      setCame(forward ? 'next' : 'prev');
      step();
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [onPrev, onNext]);

  if (!payload) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-xs text-sm leading-6 text-muted-foreground">
          Ask something and the whole pipeline lands here — what BRAIN #1 made of
          it, what BRAIN #2 planned, what PYTHON ran, and what BRAIN #3 wrote.
        </p>
      </div>
    );
  }

  const trace = recordValue(payload.brainTrace);
  const memory = recordValue(trace?.memory);
  // The server's clock, not the browser's. It is what both brains were handed
  // and what every time word in the plan resolved against; the browser's own
  // timestamp is a different clock measuring a different moment.
  const clock = typeof memory?.currentTime === 'string' ? memory.currentTime : null;
  const pipeline = turnPipeline(payload);
  const chips = modeChips(memory);
  const asked = recordValue(trace?.question)?.question;
  // The trace value is what the brain was actually sent; the prop is this app's
  // own copy, and only stands in on an error turn that never parsed a body. On
  // a turn that went wrong the difference between them is the finding.
  const questionText = typeof asked === 'string' ? asked : (question ?? null);
  const answer = recordValue(trace?.answer)?.answer;
  const answerText = typeof answer === 'string' ? answer : null;

  const copyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(pipeline, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stepper = onPrev || onNext;

  return (
    <div ref={panelRef} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
      <div
        className="flex shrink-0 items-start gap-3 border-b border-border bg-neutral-900/60 px-5 py-3.5"
        onDoubleClick={copyAll}
        title="Double-click to copy the whole turn"
      >
        <div className="min-w-0 flex-1">
          {questionText && (
            <p className="text-sm font-medium leading-5 text-foreground">{questionText}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            {clock && <span className="font-mono">{clock}</span>}
            {chips.map((chip) => (
              <span key={chip} className="rounded border border-white/10 px-1.5 py-0.5">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {copied ? (
            <span
              aria-live="polite"
              className="flex items-center gap-1.5 px-2 text-[11px] text-emerald-400"
            >
              <Check className="h-3 w-3" />
              Copied
            </span>
          ) : (
            <button
              type="button"
              onClick={copyAll}
              title="Copy the whole turn as JSON"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
          {stepper && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCame('prev');
                  onPrev?.();
                }}
                disabled={!onPrev}
                title="Previous turn (←)"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCame('next');
                  onNext?.();
                }}
                disabled={!onNext}
                title="Next turn (→)"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Keyed on the turn so React remounts the stack and the glide replays. */}
      <div
        key={requestId}
        className={`min-h-0 flex-1 overflow-auto ${
          came === 'next' ? 'turn-glide-next' : came === 'prev' ? 'turn-glide-prev' : ''
        }`}
      >
        {STAGES.filter(({ key, select, omitWhenEmpty }) => {
          if (!omitWhenEmpty) return true;
          const drawn = select ? select(pipeline) : pipeline[key];
          if (drawn == null) return false;
          // An object with no keys draws as `{}`, which reads as a stage that
          // ran and found nothing rather than one with nothing to do.
          return typeof drawn !== 'object' || Object.keys(drawn).length > 0;
        }).map(({ key, title, select, preview, hidden, collapsed }, index) => {
          // `?? null` on both branches: `JSON.stringify(undefined)` is
          // `undefined`, not a string, and the viewer reads it as one. An error
          // turn carries no `brainTrace`, so the never-omitted plan box selects
          // nothing and would take the page down with it.
          const drawn = (select ? select(pipeline) : pipeline[key]) ?? null;
          return (
            <JsonViewer
              key={key}
              data={drawn}
              title={title}
              alwaysOpen={!collapsed}
              hiddenKeys={typeof hidden === 'function' ? hidden(drawn) : (hidden ?? BOOKKEEPING)}
              previewTransform={preview}
              hideCopy
              className={index === 0 ? 'border-t-0' : undefined}
            />
          );
        })}
      </div>

      {/*
        The last stage, pinned rather than scrolled. It is the one payload that
        is prose, and it stays in view while the stages above it are read —
        which is the comparison anyone has this open to make. Being prose, it
        is also the one drawn as Markdown rather than as JSON: a `<p>` collapses
        the newlines it was written with and leaves the `###` and `**` showing.
      */}
      {answerText ? (
        <div className="shrink-0 border-t border-border bg-neutral-950/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
              BRAIN #3 · translate
            </span>
          </div>
          <div className="mt-2 max-h-32 overflow-auto text-sm leading-relaxed text-foreground">
            <BrainMarkdown>{answerText}</BrainMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}
