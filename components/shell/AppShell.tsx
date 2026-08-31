import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

/**
 * The persistent frame: sidebar left, page right.
 *
 * Pages render their own `PageHeader` rather than inheriting one, because the
 * headers differ — Ask carries live controls, Logs carries a connection
 * indicator — and a shell that tried to own all of them would grow a prop for
 * each.
 *
 * Brain-specific state will return only when its clean-room contract exists.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
