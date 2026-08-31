'use client';

import { useCallback, useMemo, useState } from 'react';
import { PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { buildBody, validate } from '@/lib/chat-request';
import { Composer } from './Composer';
import { useAskSession } from './AskSession';
import { TurnInspector } from './TurnInspector';
import { TurnList } from './TurnList';
import type { Turn } from './types';

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
  const problems = useMemo(() => validate(state), [state]);

  const send = useCallback(async () => {
    if (busy || problems.length > 0) return;

    const body = buildBody(state);
    const requestText = JSON.stringify(body);
    const localId = crypto.randomUUID();
    const startedAt = Date.now();
    const pending: Turn = {
      localId,
      question: body.message,
      request: body,
      requestText,
      status: 'pending',
      startedAt,
    };

    setState({ message: '' });
    setTurns((current) => [...current, pending]);
    setSelectedId(localId);
    setBusy(true);

    const settle = (patch: Partial<Turn>) => {
      setTurns((current) =>
        current.map((turn) =>
          turn.localId === localId
            ? { ...turn, ...patch, latencyMs: Date.now() - startedAt }
            : turn
        )
      );
    };

    try {
      const response = await fetch('/api/brain/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestText,
      });
      const rawText = await response.text();
      let raw: Record<string, unknown> | undefined;
      try {
        raw = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        raw = undefined;
      }

      settle({
        status: response.ok ? 'ok' : 'failed',
        httpStatus: response.status,
        rawText,
        raw,
        failure: response.ok ? undefined : `HTTP ${response.status} — ${rawText}`,
      });
    } catch (error) {
      settle({ status: 'failed', failure: `Request failed — ${String(error)}` });
    } finally {
      setBusy(false);
    }
  }, [busy, problems.length, setSelectedId, setState, setTurns, state]);

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
                setTurns([]);
                setSelectedId(undefined);
              }}
              title="Clear turns"
            >
              <Trash2 className="h-4 w-4" />
            </HeaderButton>
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
          <TurnList turns={turns} selectedId={selectedId} onSelect={setSelectedId} />
          <Composer
            state={state}
            onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
            onSend={() => void send()}
            busy={busy}
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
    </>
  );
}

function HeaderButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
