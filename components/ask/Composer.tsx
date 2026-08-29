'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Send, Settings2 } from 'lucide-react';
import type { ComposerState, MemorySource, QuestionOrigin, ValidationProblem } from '@/lib/chat-request';

const MEMORY_OPTIONS: ReadonlyArray<{ value: MemorySource; label: string; hint: string }> = [
  { value: 'brain', label: 'Brain memory', hint: 'Omits history. The brain replays its own session — what a student gets.' },
  { value: 'client', label: 'Client transcript', hint: 'Sends the turns on this page, so you control the context exactly.' },
  { value: 'cold', label: 'Cold', hint: 'Sends an empty history, suppressing memory entirely.' },
];

const ORIGINS: readonly QuestionOrigin[] = ['dev', 'client', 'bot'];

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const blocked = problems.length > 0 || busy;

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      {problems.length > 0 && state.message.trim() !== '' && (
        <ul className="mb-2 space-y-0.5 text-xs text-red-300">
          {problems.map((problem) => (
            <li key={problem.field}>
              <span className="font-mono">{problem.field}</span> {problem.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={state.message}
          onChange={(event) => onChange({ message: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // Shift holds the newline. `isComposing` is the IME guard: the
            // Enter that accepts a composition candidate is finishing a word,
            // and sending on it would fire off a half-typed question.
            if (event.shiftKey || event.nativeEvent.isComposing) return;
            // Prevented whether or not the send goes through, so a blocked
            // composer swallows the key rather than dropping a stray newline
            // into the question someone is about to retry.
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

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Memory</span>
          <select
            value={state.memorySource}
            onChange={(event) => onChange({ memorySource: event.target.value as MemorySource })}
            title={MEMORY_OPTIONS.find((option) => option.value === state.memorySource)?.hint}
            className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-foreground focus:outline-none"
          >
            {MEMORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onOpenBulk}
          className="rounded-lg border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Bulk run
        </button>

        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="h-3 w-3" />
          Request
          <ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {advancedOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs sm:grid-cols-3">
          <Field label="conversationId" value={state.conversationId} onChange={(v) => onChange({ conversationId: v })} />
          <Field label="visitorId" value={state.visitorId ?? ''} onChange={(v) => onChange({ visitorId: v || undefined })} />
          <Field label="timezone" value={state.timezone ?? ''} onChange={(v) => onChange({ timezone: v || undefined })} />
          <Field label="styleMode" value={state.styleMode ?? ''} onChange={(v) => onChange({ styleMode: v || undefined })} />
          <Field label="responseMode" value={state.responseMode ?? ''} onChange={(v) => onChange({ responseMode: v || undefined })} />
          <Field
            label="now"
            value={state.now ?? ''}
            placeholder="ISO instant — pins the clock"
            onChange={(v) => onChange({ now: v || undefined })}
          />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">questionOrigin</span>
            <select
              value={state.questionOrigin}
              onChange={(event) => onChange({ questionOrigin: event.target.value as QuestionOrigin })}
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground focus:outline-none"
            >
              {ORIGINS.map((origin) => (
                <option key={origin} value={origin}>
                  {origin}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />
    </label>
  );
}
