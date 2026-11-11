'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BrainMarkdown } from '@/components/BrainMarkdown';
import { failureMessage } from '@/lib/brain-failure';
import { notSaidReason, readCardAnswer, type CardAnswer } from '@/lib/answer-cards';

type Read =
  | { state: 'loading' }
  | { state: 'ready'; answer: CardAnswer }
  | { state: 'failed'; problem: string };

/** What the bot would say from one card: the Brain writes it by code, and this shows it as a chat would. */
export function CardAnswerPanel({
  cardId,
  steps,
  datasetVersion,
  identityHash,
}: {
  cardId: string;
  steps: number;
  datasetVersion: string;
  identityHash: string;
}) {
  const [read, setRead] = useState<Read>({ state: 'loading' });

  useEffect(() => {
    let stale = false;
    setRead({ state: 'loading' });
    const params = new URLSearchParams({
      card_id: cardId,
      dataset_version: datasetVersion,
      identity_hash: identityHash,
    });
    fetch(`/api/brain/answer-cards/card?${params}`, { cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        const answer = response.ok ? readCardAnswer(body) : null;
        if (stale) return;
        if (answer) {
          setRead({ state: 'ready', answer });
          return;
        }
        setRead({
          state: 'failed',
          problem:
            response.status === 404
              ? 'This Brain cannot write a card’s answer yet. Pull the latest Brain and restart it.'
              : response.status === 409
                ? 'The Brain now serves a newer release than this list. Read the list again.'
                : response.ok
                  ? 'The Brain sent an answer this page cannot read.'
                  : failureMessage(body, response.status),
        });
      })
      .catch(() => {
        if (!stale) setRead({ state: 'failed', problem: 'The Brain is not reachable.' });
      });
    return () => {
      stale = true;
    };
  }, [cardId, datasetVersion, identityHash]);

  const said = read.state === 'ready' && read.answer.text !== null;
  return (
    <section
      className={`space-y-3 rounded-2xl border p-5 ${said ? 'border-sky-500/40 bg-sky-500/[0.06]' : 'border-white/10 bg-white/5'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">What the bot will say</h3>
        <span className="text-xs text-muted-foreground">
          {said ? 'Written by code. No AI call.' : 'Code answers only from a card it can trust.'}
        </span>
      </div>
      {read.state === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Writing the answer from the card
        </p>
      )}
      {read.state === 'failed' && <p className="text-sm text-amber-300">{read.problem}</p>}
      {read.state === 'ready' && read.answer.text !== null && (
        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-foreground">
          <BrainMarkdown>{read.answer.text}</BrainMarkdown>
        </div>
      )}
      {read.state === 'ready' && read.answer.text === null && (
        <p className="text-sm text-amber-300">
          {notSaidReason(read.answer, steps)} The bot answers this from the pages, as it does today.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A preview. No chat reply uses a card yet: that comes behind a dev setting, and only when a question
        clearly matches one card.
      </p>
    </section>
  );
}
