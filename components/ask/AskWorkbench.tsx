'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileDown,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from 'lucide-react';
import { BulkQuestionModal } from '@/components/BulkQuestionModal';
import { PageHeader } from '@/components/shell/PageHeader';
import { buildBody, validate, type ChatMessageInput } from '@/lib/chat-request';
import { BulkRunner, type BulkProgress } from './BulkRunner';
import { Composer } from './Composer';
import { useAskSession } from './AskSession';
import { TurnInspector } from './TurnInspector';
import { TurnList } from './TurnList';
import type { Turn } from './types';

interface SendOptions {
  signal?: AbortSignal;
  priorMessages?: ChatMessageInput[];
}

export function AskWorkbench() {
  const {
    state,
    setState,
    turns,
    setTurns,
    selectedId,
    setSelectedId,
    inspectorOpen,
    setInspectorOpen,
  } = useAskSession();
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkProgress | null>(null);
  const [conversationExportOpen, setConversationExportOpen] = useState(false);
  const [conversationCopied, setConversationCopied] = useState(false);
  const conversationExportRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef(turns);
  const problems = useMemo(() => validate(state), [state]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    if (!conversationExportOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        conversationExportRef.current &&
        !conversationExportRef.current.contains(event.target as Node)
      ) {
        setConversationExportOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConversationExportOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [conversationExportOpen]);

  const send = useCallback(async (message: string, options: SendOptions = {}): Promise<Turn> => {
    const priorMessages =
      options.priorMessages ??
      turnsRef.current.flatMap<ChatMessageInput>((turn) => {
        const answer = typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined;
        if (turn.status !== 'ok' || !answer) return [];
        return [
          { role: 'user', content: turn.question },
          { role: 'assistant', content: answer },
        ];
      });
    const body = buildBody({ message }, priorMessages);
    const requestText = JSON.stringify(body);
    const localId = crypto.randomUUID();
    const startedAt = Date.now();
    const pending: Turn = {
      localId,
      question: message.trim(),
      request: body,
      requestText,
      status: 'pending',
      startedAt,
    };

    turnsRef.current = [...turnsRef.current, pending];
    setTurns(turnsRef.current);
    setSelectedId(localId);

    const settle = (patch: Partial<Turn>): Turn => {
      const settled = { ...pending, ...patch, latencyMs: Date.now() - startedAt };
      turnsRef.current = turnsRef.current.map((turn) =>
        turn.localId === localId ? settled : turn
      );
      setTurns(turnsRef.current);
      return settled;
    };

    try {
      const response = await fetch('/api/brain/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestText,
        signal: options.signal,
      });
      const rawText = await response.text();
      let raw: Record<string, unknown> | undefined;
      try {
        raw = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        raw = undefined;
      }

      return settle({
        status: response.ok ? 'ok' : 'failed',
        httpStatus: response.status,
        rawText,
        raw,
        requestId:
          response.headers.get('x-request-id') ??
          (typeof raw?.requestId === 'string' ? raw.requestId : undefined),
        failure: response.ok ? undefined : describeFailure(response.status, raw),
      });
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === 'AbortError';
      const raw = stopped
        ? {
            error: 'The request was stopped before the Brain answered.',
            reason: 'cancelled',
            detail: 'The Dev UI cancelled this request.',
            retryable: true,
          }
        : {
            error: 'The Dev UI could not complete the request.',
            reason: 'client_network_error',
            detail: error instanceof Error ? error.message : String(error),
            retryable: true,
          };
      return settle({
        status: 'failed',
        raw,
        failure: describeFailure(0, raw),
      });
    }
  }, [setSelectedId, setTurns]);

  const sendFromComposer = useCallback(async () => {
    if (busy || bulk?.running || problems.length > 0) return;
    const message = state.message;
    setState({ message: '' });
    setBusy(true);
    try {
      await send(message);
    } finally {
      setBusy(false);
    }
  }, [bulk?.running, busy, problems.length, send, setState, state.message]);

  const conversationJson = () =>
    JSON.stringify(
      turns.map((turn) => ({
        question: turn.question,
        status: turn.status,
        httpStatus: turn.httpStatus,
        latencyMs: turn.latencyMs,
        requestId: turn.requestId,
        request: turn.request,
        response: turn.raw,
      })),
      null,
      2
    );

  const copyConversation = () => {
    void navigator.clipboard.writeText(conversationJson());
    setConversationExportOpen(false);
    setConversationCopied(true);
    setTimeout(() => setConversationCopied(false), 2000);
  };

  const downloadConversation = () => {
    const url = URL.createObjectURL(
      new Blob([conversationJson()], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rockygpt-dev-conversation-${new Date().toISOString().slice(0, 19)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setConversationExportOpen(false);
  };

  const selected = turns.find((turn) => turn.localId === selectedId);
  const position = turns.findIndex((turn) => turn.localId === selectedId);
  const stepTurn = (delta: number) => {
    const next = position + delta;
    if (next >= 0 && next < turns.length) setSelectedId(turns[next].localId);
  };

  return (
    <>
      <PageHeader
        title="Ask & Inspect"
        subtitle={`${turns.length} turn${turns.length === 1 ? '' : 's'} · POST /v1/chat`}
        actions={
          <>
            <HeaderButton
              onClick={() => {
                turnsRef.current = [];
                setTurns([]);
                setSelectedId(undefined);
              }}
              title="Clear turns"
            >
              <Trash2 className="h-4 w-4" />
            </HeaderButton>
            {turns.length > 0 && (
              <div ref={conversationExportRef} className="relative">
                <HeaderButton
                  onClick={() => setConversationExportOpen((open) => !open)}
                  title="Export all conversation as JSON"
                  expanded={conversationExportOpen}
                >
                  {conversationCopied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </HeaderButton>
                {conversationExportOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-white/15 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur-2xl"
                  >
                    <ConversationExportItem
                      icon={ClipboardCopy}
                      label="Copy JSON"
                      onClick={copyConversation}
                    />
                    <ConversationExportItem
                      icon={FileDown}
                      label="Download JSON"
                      onClick={downloadConversation}
                    />
                  </div>
                )}
              </div>
            )}
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
            onSend={() => void sendFromComposer()}
            onOpenBulk={() => setBulkOpen(true)}
            busy={busy || bulk?.running === true}
            problems={problems}
          />
        </div>

        {inspectorOpen && (
          <div className="flex min-h-0 w-full shrink-0 flex-col border-t border-border lg:w-[46rem] lg:max-w-[50%] lg:border-t-0">
            <TurnInspector
              turn={selected}
              onPrev={position > 0 ? () => stepTurn(-1) : undefined}
              onNext={position >= 0 && position < turns.length - 1 ? () => stepTurn(1) : undefined}
            />
          </div>
        )}
      </div>

      <BulkQuestionModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        sessionQuestions={turns.map((turn) => turn.question)}
        onStartSequence={(questions, delayMs, preserveHistory) => {
          void runBulk(questions, delayMs, preserveHistory, send, setBulk);
        }}
      />
    </>
  );
}

function describeFailure(status: number, body?: Record<string, unknown>): string {
  const message =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.detail === 'string'
        ? body.detail
        : 'The Brain request failed.';
  const reason = typeof body?.reason === 'string' ? body.reason : undefined;

  if (reason === 'timeout') return `Timed out — ${message}`;
  if (reason === 'unreachable') return `Connection failed — ${message}`;
  if (reason === 'misconfigured') return `Configuration error — ${message}`;
  if (reason === 'cancelled') return `Cancelled — ${message}`;
  if (reason === 'client_network_error') return `Browser request failed — ${message}`;
  return `HTTP ${status} — ${message}`;
}

async function runBulk(
  questions: string[],
  delayMs: number,
  preserveHistory: boolean,
  send: (message: string, options?: SendOptions) => Promise<Turn>,
  setBulk: (progress: BulkProgress | null) => void
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  let asked = 0;
  let failed = 0;
  let declined = 0;
  const history: ChatMessageInput[] = [];

  setBulk({ running: true, asked, failed, declined, total: questions.length, stop });

  for (const question of questions) {
    if (controller.signal.aborted) break;
    const turn = await send(question, {
      signal: controller.signal,
      priorMessages: preserveHistory ? history : [],
    });
    asked += 1;
    if (turn.status === 'failed') failed += 1;
    else if (turn.status === 'declined') declined += 1;
    if (preserveHistory && turn.status === 'ok' && typeof turn.raw?.answer === 'string') {
      history.push(
        { role: 'user', content: turn.question },
        { role: 'assistant', content: turn.raw.answer }
      );
    }
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

function HeaderButton({
  onClick,
  title,
  children,
  expanded,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
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

function ConversationExportItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ClipboardCopy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-white/10"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  );
}
