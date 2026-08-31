'use client';

import { Layers, Loader2, Send } from 'lucide-react';
import type { ComposerState, ValidationProblem } from '@/lib/chat-request';

export function Composer({
  state,
  onChange,
  onSend,
  onOpenBulk,
  busy,
  problems,
}: {
  state: ComposerState;
  onChange: (next: Partial<ComposerState>) => void;
  onSend: () => void;
  onOpenBulk: () => void;
  busy: boolean;
  problems: ValidationProblem[];
}) {
  const blocked = problems.length > 0 || busy;

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={state.message}
          onChange={(event) => onChange({ message: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!blocked) onSend();
          }}
          rows={2}
          placeholder="Ask the brain something…  (↵ to send, ⇧↵ for a new line)"
          className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-sky-500/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={blocked}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/90 text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          title="Send (↵)"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onOpenBulk}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Layers className="h-3.5 w-3.5" />
          Bulk questions
        </button>
      </div>
    </div>
  );
}
