'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { ComposerState } from '@/lib/chat-request';
import type { Turn } from './types';

export type InspectorTab = 'answer' | 'sources' | 'trace' | 'request' | 'raw';
const STORAGE_KEY = 'rockygpt-dev.ask-session.v1';
const TABS: InspectorTab[] = ['answer', 'sources', 'trace', 'request', 'raw'];

interface AskSession {
  state: ComposerState;
  setState: Dispatch<SetStateAction<ComposerState>>;
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  selectedId: string | undefined;
  setSelectedId: Dispatch<SetStateAction<string | undefined>>;
  inspectorOpen: boolean;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  inspectorTab: InspectorTab;
  setInspectorTab: Dispatch<SetStateAction<InspectorTab>>;
  ready: boolean;
  storageWarning: string | undefined;
}

const AskSessionContext = createContext<AskSession | null>(null);

export function AskSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ComposerState>({ message: '' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('answer');
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string>();
  const restoredOnce = useRef(false);
  const storageReadable = useRef(true);

  useEffect(() => {
    // Fast Refresh can rerun effects while a request is still alive.
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const session = JSON.parse(saved) as Record<string, unknown>;
        if (!Array.isArray(session.turns) || !session.turns.every(isSavedTurn)) {
          throw new Error('Invalid saved conversation');
        }
        const restored = session.turns.map((turn): Turn => turn.status === 'pending' ? {
          ...turn,
          status: 'failed',
          failure: 'The page reloaded before this reply arrived. Send the question again to retry.',
        } : turn);
        setTurns(restored);
        setState({ message: typeof session.message === 'string' ? session.message : '' });
        setSelectedId(restored.some(turn => turn.localId === session.selectedId)
          ? session.selectedId as string : restored.at(-1)?.localId);
        if (typeof session.inspectorOpen === 'boolean') setInspectorOpen(session.inspectorOpen);
        if (TABS.includes(session.inspectorTab as InspectorTab)) {
          setInspectorTab(session.inspectorTab as InspectorTab);
        }
      }
    } catch {
      // Preserve unreadable saved data instead of overwriting it with empty turns.
      storageReadable.current = false;
      setStorageWarning('Could not restore tab storage. Keep this page open and export turns before leaving.');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    // Do not replace a saved conversation with the empty server-rendered state.
    if (!ready || !storageReadable.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        message: state.message, turns, selectedId, inspectorOpen, inspectorTab,
      }));
      setStorageWarning(undefined);
    } catch {
      setStorageWarning('This conversation could not be saved in this tab. Export turns before reloading or leaving.');
    }
  }, [ready, state, turns, selectedId, inspectorOpen, inspectorTab]);

  const value = useMemo<AskSession>(
    () => ({
      state,
      setState,
      turns,
      setTurns,
      selectedId,
      setSelectedId,
      inspectorOpen,
      setInspectorOpen,
      inspectorTab,
      setInspectorTab,
      ready,
      storageWarning,
    }),
    [state, turns, selectedId, inspectorOpen, inspectorTab, ready, storageWarning]
  );

  return <AskSessionContext.Provider value={value}>{children}</AskSessionContext.Provider>;
}

function isSavedTurn(value: unknown): value is Turn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as Turn;
  return typeof turn.localId === 'string' && typeof turn.question === 'string'
    && typeof turn.requestText === 'string' && Number.isFinite(turn.startedAt)
    && ['pending', 'ok', 'declined', 'not_built', 'failed'].includes(turn.status)
    && Array.isArray(turn.request?.messages)
    && turn.request.messages.every(message => message
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string');
}

export function useAskSession(): AskSession {
  const session = useContext(AskSessionContext);
  if (!session) throw new Error('useAskSession must be used inside AskSessionProvider.');
  return session;
}
