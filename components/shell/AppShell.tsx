import type { ReactNode } from 'react';
import { AskSessionProvider } from '@/components/ask/AskSession';
import { ShellFrame } from './ShellFrame';

/**
 * The persistent frame: sidebar left, page right.
 *
 * Pages render their own `PageHeader` rather than inheriting one, because the
 * headers differ — Ask carries live controls, Logs carries a connection
 * indicator — and a shell that tried to own all of them would grow a prop for
 * each.
 *
 * The Ask session lives above page navigation so a test conversation survives
 * moving around the control room.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellFrame>
      <AskSessionProvider>{children}</AskSessionProvider>
    </ShellFrame>
  );
}
