'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { ComposerState } from '@/lib/chat-request';
import type { Turn } from './types';

interface AskSession {
  state: ComposerState;
  setState: Dispatch<SetStateAction<ComposerState>>;
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  selectedId: string | undefined;
  setSelectedId: Dispatch<SetStateAction<string | undefined>>;
  inspectorOpen: boolean;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
}

const AskSessionContext = createContext<AskSession | null>(null);

export function AskSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ComposerState>({ message: '' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [inspectorOpen, setInspectorOpen] = useState(true);

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
    }),
    [state, turns, selectedId, inspectorOpen]
  );

  return <AskSessionContext.Provider value={value}>{children}</AskSessionContext.Provider>;
}

export function useAskSession(): AskSession {
  const session = useContext(AskSessionContext);
  if (!session) throw new Error('useAskSession must be used inside AskSessionProvider.');
  return session;
}
