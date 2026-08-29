'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileDown,
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
import type { Turn } from './types';
import {
  buildBody,
  buildHistory,
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

      pushTurn({
        localId,
        question: message.trim(),
        request: body,
        status: 'pending',
        startedAt,
      });
      setSelectedId(localId);

      const settle = (patch: Partial<Turn>): Turn => {
        let settled: Turn | undefined;
        setTurns((current) =>
          current.map((turn) => {
            if (turn.localId !== localId) return turn;
            settled = { ...turn, ...patch, latencyMs: Date.now() - startedAt };
            return settled;
          })
        );
        return settled ?? { localId, question: message, request: body, status: 'failed', startedAt };
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
            status: 'failed',
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

  const selected = turns.find((turn) => turn.localId === selectedId);
  const inspectable = turns.filter((turn) => turn.raw);
  const position = inspectable.findIndex((turn) => turn.localId === selectedId);

  /**
   * The session as NDJSON: one turn per line, request and response whole.
   *
   * Both export routes render the same bytes, because they are the same
   * artifact wanted two ways — a file to keep and re-read, or a paste into the
   * issue you are already writing. Making the second one a save-then-open was
   * the friction worth removing.
   */
  const sessionNdjson = () =>
    turns
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
    anchor.download = `rockygpt-dev-session-${new Date().toISOString().slice(0, 19)}.ndjson`;
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
        }`}
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
              }}
              title="Clear turns"
            >
              <Trash2 className="h-4 w-4" />
            </HeaderButton>
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
                    hint="Paste it where you are already writing"
                    onClick={copySession}
                  />
                  <ExportItem
                    icon={FileDown}
                    label="File"
                    hint=".ndjson, one turn per line"
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
          {bulk && <BulkRunner progress={bulk} />}
          <TurnList turns={turns} selectedId={selectedId} onSelect={setSelectedId} />
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
              onPrev={position > 0 ? () => setSelectedId(inspectable[position - 1].localId) : undefined}
              onNext={
                position >= 0 && position < inspectable.length - 1
                  ? () => setSelectedId(inspectable[position + 1].localId)
                  : undefined
              }
            />
          </div>
        )}
      </div>

      <BulkQuestionModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
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
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  /** Set only by a button that owns a menu, which then announces its state. */
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

  setBulk({ running: true, asked, failed, total: questions.length, stop });

  for (const question of questions) {
    if (controller.signal.aborted) break;
    const turn = await send(question, controller.signal);
    asked += 1;
    if (turn.status !== 'ok') failed += 1;
    setBulk({ running: true, asked, failed, total: questions.length, stop });
    if (delayMs > 0 && !controller.signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  setBulk({
    running: false,
    asked,
    failed,
    total: questions.length,
    stop,
    stopped: controller.signal.aborted,
  });
}
