'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/copy';

export function CopyHash({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <button
      type="button"
      onClick={() => {
        void copyText(value).then((ok) => {
          setState(ok ? 'copied' : 'failed');
          setTimeout(() => setState('idle'), 2000);
        });
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {state === 'copied' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy not available' : 'Copy'}
    </button>
  );
}
