'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { DevRuntime } from '@/lib/brain-dev-types';

function labelFor(id: string): string {
  const words = id.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-neutral-900/90 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
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
