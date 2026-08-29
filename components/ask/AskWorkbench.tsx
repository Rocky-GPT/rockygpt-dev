'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardCopy,
  Download,
  FileDown,
  Filter,
  ShieldAlert,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { BulkQuestionModal } from '@/components/BulkQuestionModal';
import { Composer } from './Composer';
import { TurnList } from './TurnList';
import { TurnInspector } from './TurnInspector';
import { BulkRunner, type BulkProgress } from './BulkRunner';
import { useAskSession } from './AskSession';
import { OUTCOMES, type Turn, type TurnOutcome } from './types';
import {
  buildBody,
  buildHistory,
  classifyFailure,
  describeFailure,
  newConversationId,
  validate,
  type ChatRequestBody,
  type ComposerState,
} from '@/lib/chat-request';

/**
 * How many turns to keep. A hundred turns of trace is a few megabytes of React
 * state, which is fine — but a long bulk session should degrade visibly rather
 * than silently, so the ceiling is stated and the drop is announced.
 */
const MAX_RETAINED_TURNS = 200;

/** The same mark and tone the list draws, so the filter reads as the list. */
const OUTCOME_TONE: Record<TurnOutcome, { icon: typeof Check; tone: string }> = {
  ok: { icon: Check, tone: 'text-emerald-400' },
  declined: { icon: ShieldAlert, tone: 'text-amber-400' },
  failed: { icon: AlertCircle, tone: 'text-red-400' },
};

const EVERY_OUTCOME: ReadonlySet<TurnOutcome> = new Set(OUTCOMES.map((outcome) => outcome.id));

export function AskWorkbench() {
  // The thread outlives this page: it is held by `AskSessionProvider` up in the
  // shell, so stepping over to Capabilities and back returns to the same
  // conversation rather than a new one. What stays local is the request in
  // flight, which genuinely does not survive leaving the page it was sent from.
  const {
    state,
    setState,
    turns,
    setTurns,
    selectedId,
    setSelectedId,
    dropped,
    setDropped,
    inspectorOpen,
    setInspectorOpen,
  } = useAskSession();
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  // A view of the list, not a fact about the thread, so it stays local: coming
  // back to Ask should show what is there rather than what was last narrowed to.
  //
  // A set rather than a flag, because the useful questions are combinations:
  // what broke and what was refused, ignoring the answers; or what answered and
  // what was refused, ignoring an outage someone already knows about.
  const [shown, setShown] = useState<ReadonlySet<TurnOutcome>>(EVERY_OUTCOME);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Read by the send path rather than the render closure, so a bulk run holding
  // one closure across dozens of awaits still sees current turns. Synced in an
  // effect rather than assigned during render, which React treats as a bug —
  // a render that is thrown away would still have mutated it.
  const turnsRef = useRef<Turn[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  // Same dismissal contract as the menus on Chat Logs: a click anywhere else
  // or Escape closes it. Bound only while open, so the app is not listening to
  // every click on the document for the sake of a menu nobody opened.
  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen]);

  const problems = useMemo(() => validate(state), [state]);

  const pushTurn = useCallback((turn: Turn) => {
    setTurns((current) => {
      const next = [...current, turn];
      if (next.length <= MAX_RETAINED_TURNS) return next;
      setDropped((count) => count + next.length - MAX_RETAINED_TURNS);
      return next.slice(next.length - MAX_RETAINED_TURNS);
    });
  }, [setTurns, setDropped]);

  /**
   * Sends one turn and records everything about it.
   *
   * No typewriter, no optimistic answer bubble, no haptics. A pending turn is a
   * question and a spinner: rendering anything where the answer goes before the
   * brain has sent one would be inventing text, which is the one thing this
   * app must not do.
   */
  const send = useCallback(
    async (message: string, signal?: AbortSignal): Promise<Turn> => {
      const localId = crypto.randomUUID();
      const composer: ComposerState = { ...state, message };
      const history = buildHistory(
        turnsRef.current.map((turn) => ({
          question: turn.question,
          answer: typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined,
          ok: turn.status === 'ok',
        }))
      );
      const body: ChatRequestBody = buildBody(composer, history);
      const startedAt = Date.now();

      const pending: Turn = {
        localId,
        question: message.trim(),
        request: body,
        status: 'pending',
        startedAt,
      };
      pushTurn(pending);
      setSelectedId(localId);

      /**
       * Records how the turn ended, and answers with it.
       *
       * The settled turn is built here rather than read back out of the state
       * updater. React runs an updater during render, not during the call that
       * schedules it — it runs one early only as a bail-out optimisation, and
       * only while nothing else is queued. So the assignment this used to read
       * back was there for a single turn and gone during a bulk run, where the
       * queue is never empty, and the `?? { status: 'failed' }` it fell through
       * to reported every answered question as a failure. The rows on screen
       * were right the whole time: only what `send` returned was wrong, and
       * the bulk counter is the one thing that reads it.
       */
      const settle = (patch: Partial<Turn>): Turn => {
        const settled: Turn = { ...pending, ...patch, latencyMs: Date.now() - startedAt };
        setTurns((current) => current.map((turn) => (turn.localId === localId ? settled : turn)));
        return settled;
      };

      try {
        const response = await fetch('/api/brain/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
        // Bytes first, then parse. The raw text is what the wire said; a
        // re-stringified object is not the same artifact.
        const rawText = await response.text();
        const headerId = response.headers.get('x-request-id') ?? undefined;

        let raw: Record<string, unknown> | undefined;
        try {
          raw = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          raw = undefined;
        }
        const requestId =
          headerId ?? (typeof raw?.requestId === 'string' ? raw.requestId : undefined);

        if (!response.ok) {
          return settle({
            status: classifyFailure(rawText),
            httpStatus: response.status,
            rawText,
            raw,
            requestId,
            failure: describeFailure(response.status, rawText, requestId),
          });
        }

        return settle({
          status: 'ok',
          httpStatus: response.status,
          rawText,
          raw,
          requestId,
        });
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        return settle({
          status: 'failed',
          failure: aborted ? 'Stopped.' : `Request failed — ${String(error)}`,
        });
      }
    },
    [state, pushTurn, setTurns, setSelectedId]
  );

  const sendFromComposer = useCallback(async () => {
    if (problems.length > 0 || busy) return;
    const message = state.message;
    setState((current) => ({ ...current, message: '' }));
    setBusy(true);
    try {
      await send(message);
    } finally {
      setBusy(false);
    }
  }, [problems.length, busy, state.message, send, setState]);

  // Counted from the turns rather than from the bulk progress, so a single
  // send's outcome is filterable too, and so the counts cannot disagree with
  // what the filter actually shows.
  const counts = OUTCOMES.reduce<Record<TurnOutcome, number>>(
    (tally, outcome) => ({
      ...tally,
      [outcome.id]: turns.filter((turn) => turn.status === outcome.id).length,
    }),
    { ok: 0, declined: 0, failed: 0 }
  );
  const filtering = shown.size < OUTCOMES.length;
  // A turn still in flight has no outcome to filter on, and hiding it would
  // make a run look stalled. It stays, whatever is selected.
  const shownTurns = filtering
    ? turns.filter((turn) => turn.status === 'pending' || shown.has(turn.status))
    : turns;

  const toggleOutcome = (outcome: TurnOutcome) =>
    setShown((current) => {
      const next = new Set(current);
      if (next.has(outcome)) next.delete(outcome);
      else next.add(outcome);
      return next;
    });

  // What a count chip does: narrow to just this, or undo that.
  const showOnly = (outcome: TurnOutcome) =>
    setShown((current) =>
      current.size === 1 && current.has(outcome) ? EVERY_OUTCOME : new Set([outcome])
    );

  // Named where the export is offered, so the narrowed case is never a
  // surprise found later in the file.
  const exportScope = filtering
    ? `the ${shownTurns.length} shown turn${shownTurns.length === 1 ? '' : 's'}`
    : `all ${shownTurns.length} turn${shownTurns.length === 1 ? '' : 's'}`;

  const selected = turns.find((turn) => turn.localId === selectedId);
  // Stepping walks the list on screen. It used to walk every turn carrying a
  // trace, which was the same list until a filter existed; now they differ, and
  // an arrow that jumps to a turn the filter is hiding is an arrow that undoes
  // the filter without saying so.
  const position = shownTurns.findIndex((turn) => turn.localId === selectedId);

  const stepTurn = useCallback(
    (delta: number) => {
      if (shownTurns.length === 0) return;
      const at = shownTurns.findIndex((turn) => turn.localId === selectedId);
      // Nothing selected yet: enter the list from the end you asked for.
      const next = at === -1 ? (delta > 0 ? 0 : shownTurns.length - 1) : at + delta;
      if (next < 0 || next >= shownTurns.length) return;
      setSelectedId(shownTurns[next].localId);
    },
    [shownTurns, selectedId, setSelectedId]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
      const back = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
      if (!forward && !back) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // The inspector binds these on its own panel and calls `preventDefault`;
      // letting both fire would step twice for one press.
      if (event.defaultPrevented) return;
      // A caret is what arrow keys are for wherever text is being edited, and
      // an open dialog owns its own keys.
      // `event.target` is only an element when something is focused; on a
      // document-level keydown it can be the document itself, which has no
      // `closest` and would throw rather than fall through.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      stepTurn(forward ? 1 : -1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [stepTurn]);

  /**
   * The session as NDJSON: one turn per line, request and response whole.
   *
   * Both export routes render the same bytes, because they are the same
   * artifact wanted two ways — a file to keep and re-read, or a paste into the
   * issue you are already writing. Making the second one a save-then-open was
   * the friction worth removing.
   *
   * It exports what the list shows. Narrowing to the failures and then
   * exporting is one action — here are the ones that broke — and an export
   * that quietly widened back to everything would be the wrong artifact
   * attached to the report.
   */
  const sessionNdjson = () =>
    shownTurns
      .map((turn) =>
        JSON.stringify({
          question: turn.question,
          status: turn.status,
          httpStatus: turn.httpStatus,
          latencyMs: turn.latencyMs,
          requestId: turn.requestId,
          request: turn.request,
          response: turn.raw,
        })
      )
      .join('\n');

  const copySession = () => {
    void navigator.clipboard.writeText(sessionNdjson());
    setExportOpen(false);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const saveSessionFile = () => {
    const blob = new Blob([sessionNdjson()], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const scope = filtering
      ? `-${OUTCOMES.filter((outcome) => shown.has(outcome.id))
          .map((outcome) => outcome.id)
          .join('-')}`
      : '';
    anchor.download = `rockygpt-dev-session${scope}-${new Date().toISOString().slice(0, 19)}.ndjson`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Ask & Inspect"
        subtitle={`${state.conversationId || 'new thread'} · ${turns.length} turn${turns.length === 1 ? '' : 's'}${
          dropped ? ` · ${dropped} dropped` : ''
        }${filtering ? ` · showing ${shownTurns.length} of ${turns.length}` : ''}`}
        actions={
          <>
            <HeaderButton
              onClick={() => setState((current) => ({ ...current, conversationId: newConversationId() }))}
              title="New thread — a fresh conversationId, keeping the turns on screen"
            >
              <Plus className="h-4 w-4" />
            </HeaderButton>
            <HeaderButton
              onClick={() => {
                setTurns([]);
                setSelectedId(undefined);
                setDropped(0);
                setShown(EVERY_OUTCOME);
              }}
              title="Clear turns"
            >
              <Trash2 className="h-4 w-4" />
            </HeaderButton>
            {/* Offered only when there is something to filter to. */}
            {turns.length > 0 && (
              <div ref={filterRef} className="relative">
                <HeaderButton
                  onClick={() => setFilterOpen((open) => !open)}
                  title={filtering ? 'Filtered by outcome' : 'Filter by outcome'}
                  expanded={filterOpen}
                  active={filtering}
                >
                  <Filter className="h-4 w-4" />
                </HeaderButton>
                {filterOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-2xl border border-white/15 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur-2xl"
                  >
                    {OUTCOMES.map(({ id, label }) => {
                      const { icon: Mark, tone } = OUTCOME_TONE[id];
                      const on = shown.has(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={on}
                          onClick={() => toggleOutcome(id)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/10"
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              on ? 'border-sky-400/60 bg-sky-500/20' : 'border-white/20'
                            }`}
                          >
                            {on && <Check className="h-3 w-3 text-sky-300" />}
                          </span>
                          <Mark className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
                          <span className="min-w-0 flex-1 text-sm text-foreground">{label}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {counts[id]}
                          </span>
                        </button>
                      );
                    })}
                    {filtering && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setShown(EVERY_OUTCOME)}
                        className="mt-1 flex w-full items-center justify-center rounded-xl border-t border-white/10 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div ref={exportRef} className="relative">
              <HeaderButton
                onClick={() => setExportOpen((open) => !open)}
                title="Export this session as NDJSON"
                expanded={exportOpen}
              >
                {exported ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </HeaderButton>
              {exportOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl border border-white/15 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur-2xl"
                >
                  <ExportItem
                    icon={ClipboardCopy}
                    label="Clipboard"
                    hint={exportScope}
                    onClick={copySession}
                  />
                  <ExportItem
                    icon={FileDown}
                    label="File"
                    hint={`.ndjson · ${exportScope}`}
                    onClick={saveSessionFile}
                  />
                </div>
              )}
            </div>
            <HeaderButton
              onClick={() => setInspectorOpen((open) => !open)}
              title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            >
              {inspectorOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </HeaderButton>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:border-r">
          {bulk && (
            <BulkRunner progress={bulk} shown={shown} onShowOnly={showOnly} />
          )}
          <TurnList
            turns={shownTurns}
            selectedId={selectedId}
            onSelect={setSelectedId}
            filtered={filtering}
            onShowAll={() => setShown(EVERY_OUTCOME)}
          />
          <Composer
            state={state}
            onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
            onSend={sendFromComposer}
            onOpenBulk={() => setBulkOpen(true)}
            busy={busy || bulk?.running === true}
            problems={problems}
          />
        </div>

        {inspectorOpen && (
          <div className="flex min-h-0 w-full shrink-0 flex-col border-t border-border lg:w-[46rem] lg:max-w-[50%] lg:border-t-0">
            <TurnInspector
              payload={selected?.raw}
              question={selected?.question}
              requestId={selected?.localId}
              onPrev={position > 0 ? () => stepTurn(-1) : undefined}
              onNext={position >= 0 && position < shownTurns.length - 1 ? () => stepTurn(1) : undefined}
            />
          </div>
        )}
      </div>

      <BulkQuestionModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        sessionQuestions={turns.map((turn) => turn.question)}
        onStartSequence={(questions, delayMs) => {
          setBulkOpen(false);
          void runBulk(questions, delayMs, send, setBulk);
        }}
      />
    </>
  );
}

function HeaderButton({
  onClick,
  title,
  children,
  expanded,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  /** Set only by a button that owns a menu, which then announces its state. */
  expanded?: boolean;
  /** A toggle that is currently on, drawn so the list's state has a cause. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      aria-pressed={active}
      className={`rounded-lg border p-2 transition-colors ${
        active
          ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ExportItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof ClipboardCopy;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/10"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Runs a question set, one at a time.
 *
 * Sequential on purpose rather than for throughput: the bundled sets are
 * ordered conversations, so a question that says "which one is cheapest" is
 * meaningless if it races the question that established the list.
 *
 * A failure records itself and the run continues — a run that stopped at the
 * first 503 would tell you nothing about the other ninety-nine.
 */
async function runBulk(
  questions: string[],
  delayMs: number,
  send: (message: string, signal?: AbortSignal) => Promise<Turn>,
  setBulk: (progress: BulkProgress | null) => void
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  let asked = 0;
  let failed = 0;
  let declined = 0;

  setBulk({ running: true, asked, failed, declined, total: questions.length, stop });

  for (const question of questions) {
    if (controller.signal.aborted) break;
    const turn = await send(question, controller.signal);
    asked += 1;
    if (turn.status === 'failed') failed += 1;
    else if (turn.status === 'declined') declined += 1;
    setBulk({ running: true, asked, failed, declined, total: questions.length, stop });
    if (delayMs > 0 && !controller.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  setBulk({
    running: false,
    asked,
    failed,
    declined,
    total: questions.length,
    stop,
    stopped: controller.signal.aborted,
  });
}
