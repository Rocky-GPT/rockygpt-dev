'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { DevRuntime } from '@/lib/brain-dev-types';
import { copyText } from '@/lib/copy';

function labelFor(id: string): string {
  const words = id.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    setState((await copyText(text)) ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-neutral-900/90 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
    >
      {state === 'copied' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy not available' : 'Copy'}
    </button>
  );
}

export function TextsView({ texts }: { texts: DevRuntime['fixedTexts'] }) {
  return (
    <div className="space-y-4">
      {texts.map((entry) => (
        <section key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">{labelFor(entry.id)}</h2>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">{entry.id}</p>
            </div>
            <CopyButton text={entry.text} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Picked by</span>
            {entry.pickedBy?.length ? (
              entry.pickedBy.map((who) => (
                <span
                  key={who}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-foreground/90"
                >
                  {who}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-amber-300">not reported by the Brain</span>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{entry.when}</p>
          <blockquote className="mt-3 whitespace-pre-wrap rounded-xl border-l-2 border-white/20 bg-black/30 px-4 py-3 text-sm leading-6 text-foreground/90">
            {entry.text.split(/(<[^>]+>)/).map((piece, index) =>
              index % 2 === 1 ? (
                <span key={index} className="font-mono text-sky-300/80">
                  {piece}
                </span>
              ) : (
                piece
              )
            )}
          </blockquote>
        </section>
      ))}
    </div>
  );
}
