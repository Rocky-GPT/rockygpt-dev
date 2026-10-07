'use client';

import { ArrowRight } from 'lucide-react';
import type { InspectorTab } from '@/lib/inspector-tabs';
import { pipelineStages, type PipelineStage } from '@/lib/pipeline';
import { Chip, Step, type Tone } from './PacketSteps';
import { timingTotalsOf } from './TimingView';
import type { Turn } from './types';

const DOER: Record<PipelineStage['doer'], { tone: Tone; label: string; help: string }> = {
  student: { tone: 'neutral', label: 'student', help: 'What the student typed.' },
  'AI model': { tone: 'model', label: 'AI model', help: 'The AI model does this stage. It is the only stage that does.' },
  'plain code': { tone: 'good', label: 'plain code', help: 'Ordinary code does this stage, the same way every time.' },
  'not built': { tone: 'warn', label: 'not built yet', help: 'The design has this stage; the Brain does not run it yet.' },
};

const TAB_LABEL: Record<InspectorTab, string> = {
  answer: 'Answer',
  pipeline: 'Pipeline',
  sources: 'Sources',
  packet: 'Fact Packet',
  lookups: 'Lookups',
  timing: 'Timing',
  raw: 'Raw',
};

/**
 * The turn as a pipeline: the stages it went through, who did each (the AI model or plain code),
 * what each produced and how long it took. Each stage links to the tab that holds it in full.
 * Everything here is read from the response; nothing is added.
 */
export function PipelineTab({
  turn,
  tabs,
  onOpen,
}: {
  turn: Turn;
  /** The tabs this turn has, so a link only points at one that exists. */
  tabs: InspectorTab[];
  onOpen: (tab: InspectorTab) => void;
}) {
  if (turn.status === 'pending') {
    return <p className="px-5 py-4 text-xs text-muted-foreground">The stages arrive with the response.</p>;
  }
  const stages = pipelineStages({
    raw: turn.raw,
    question: turn.question,
    earlierMessages: Math.max(0, turn.request.messages.length - 1),
    failed: turn.status === 'failed',
    failure: turn.failure,
    totalsUs: timingTotalsOf(turn),
  });
  return (
    <div className="px-5 py-4">
      <ol className="ml-3 border-l border-border pl-[22px]">
        {stages.map((stage, index) => {
          const doer = DOER[stage.doer];
          const dim = stage.state === 'skipped';
          return (
            <Step key={stage.id} n={index + 1} title={stage.title}>
              <div className={dim ? 'opacity-60' : undefined}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={doer.tone} title={doer.help}>
                    {doer.label}
                  </Chip>
                  {stage.state === 'skipped' && <Chip>skipped</Chip>}
                  {stage.state === 'failed' && <Chip tone="bad">failed</Chip>}
                </div>
                <p className="mt-1.5 break-words text-[13px] leading-5 text-foreground">{stage.summary}</p>
                {stage.details.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {stage.details.map((detail) => (
                      <Chip key={detail.label} title={detail.label}>
                        <span className="text-muted-foreground">{detail.label}</span>
                        <span className="ml-1 text-foreground">{detail.value}</span>
                      </Chip>
                    ))}
                  </div>
                )}
                {stage.open && tabs.includes(stage.open) && stage.state !== 'skipped' && (
                  <button
                    type="button"
                    onClick={() => onOpen(stage.open as InspectorTab)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
                  >
                    {TAB_LABEL[stage.open]}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </Step>
          );
        })}
      </ol>
    </div>
  );
}
