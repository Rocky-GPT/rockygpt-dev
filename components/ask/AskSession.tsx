'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { Turn } from './types';
import { newConversationId, type ComposerState } from '@/lib/chat-request';

/**
 * The Ask & Inspect thread, held above the route that draws it.
 *
 * Next unmounts a page when you leave it, so state owned by `AskWorkbench` died
 * on the way to Capabilities and came back as a fresh thread: new
 * `conversationId`, no turns, nothing to compare against. That is a real loss —
 * the turns are the work, some of them minutes of brain time — and it happened
 * on a click that promised nothing of the sort.
 *
 * This provider is mounted by `AppShell`, which the root layout renders once,
 * so the thread outlives every client-side navigation between sections. It does
 * not outlive a reload, which is deliberate: the turns run to megabytes of
 * trace and would not reliably fit in `sessionStorage`.
 *
 * Only what belongs to the *conversation* lives here. `busy` and the bulk-run
 * progress stay in the workbench, because they describe a request in flight
 * rather than a thread, and a spinner restored onto a page whose fetch you can
 * no longer see would be a lie. An in-flight send still lands: its closure
 * outlives the unmount and writes its turn through the setters below.
 */
interface AskSession {
  state: ComposerState;
  setState: Dispatch<SetStateAction<ComposerState>>;
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  selectedId: string | undefined;
  setSelectedId: Dispatch<SetStateAction<string | undefined>>;
  dropped: number;
  setDropped: Dispatch<SetStateAction<number>>;
  inspectorOpen: boolean;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
}

const AskSessionContext = createContext<AskSession | null>(null);

/**
 * The composer's starting state.
 *
 * `conversationId` is deliberately empty rather than minted here. This runs on
 * the server before it hydrates, so a `crypto.randomUUID()` in the initial
 * state runs twice and produces two different ids — the server renders one into
 * the header and the client renders another, which React reports as a hydration
 * mismatch. The id is minted in the effect below, where only the browser runs
 * it. `timezone` has the same problem for the same reason: the server's zone is
 * not the reader's.
 */
function initialState(): ComposerState {
  return {
    message: '',
    conversationId: '',
    questionOrigin: 'dev',
    memorySource: 'brain',
  };
}

export function AskSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ComposerState>(initialState);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dropped, setDropped] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Browser-only values, filled once on mount. See `initialState`. The guard
  // also means the id survives: this provider mounts once, and a return to Ask
  // finds the thread it left rather than minting over it.
  useEffect(() => {
    setState((current) =>
      current.conversationId
        ? current
        : {
            ...current,
            conversationId: newConversationId(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
    );
  }, []);

  const value = useMemo<AskSession>(
    () => ({
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
    }),
    [state, turns, selectedId, dropped, inspectorOpen]
  );

  return <AskSessionContext.Provider value={value}>{children}</AskSessionContext.Provider>;
}

export function useAskSession(): AskSession {
  const session = useContext(AskSessionContext);
  if (!session) {
    throw new Error('useAskSession must be used inside <AskSessionProvider>, mounted by AppShell.');
  }
  return session;
}
