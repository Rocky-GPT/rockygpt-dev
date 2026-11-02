import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import {
  PROGRESS_LABEL,
  levelProgress,
  type KnowledgeLevel,
  type KnowledgeRoadmap,
  type Progress,
} from '@/lib/knowledge-roadmap-types';

const TONE: Record<Progress, PillTone> = {
  built: 'ok',
  partial: 'warn',
  not_started: 'idle',
  never: 'idle',
};

const SEGMENT: Record<Progress, string> = {
  built: 'bg-emerald-400/80',
  partial: 'bg-amber-400/80',
  not_started: 'bg-white/15',
  never: 'bg-white/5',
};

function ProgressPill({ progress }: { progress: Progress }) {
  return <StatusPill tone={TONE[progress]}>{PROGRESS_LABEL[progress]}</StatusPill>;
}

function Segments({ level }: { level: KnowledgeLevel }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {level.domains
        .filter((domain) => domain.progress !== 'never')
        .map((domain) => (
          <span key={domain.domain} className={`h-1.5 flex-1 rounded-full ${SEGMENT[domain.progress]}`} />
        ))}
    </div>
  );
}

function summary(level: KnowledgeLevel): string {
  const { built, partial, total } = levelProgress(level);
  if (total === 0) return 'nothing planned here yet';
  return `${built} of ${total} built${partial ? `, ${partial} partly` : ''}`;
}

function Rail({ levels }: { levels: KnowledgeLevel[] }) {
  return (
    <nav aria-label="Levels" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {levels.map((level) => (
        <a
          key={level.level}
          href={`#level-${level.level}`}
          className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.07]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
            Level {level.level}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground group-hover:underline">{level.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{level.answerMadeBy}</p>
          <div className="mt-3">
            <Segments level={level} />
            <p className="mt-1.5 text-[11px] text-muted-foreground">{summary(level)}</p>
          </div>
        </a>
      ))}
    </nav>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <div className="mt-2 text-sm leading-6 text-foreground/90">{children}</div>
    </div>
  );
}

function LevelCard({ level }: { level: KnowledgeLevel }) {
  return (
    <details id={`level-${level.level}`} open className="group scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-xs font-semibold text-sky-300">
          Level {level.level}
        </span>
        <h2 className="text-base font-semibold tracking-tight">{level.name}</h2>
        <span className="text-xs text-muted-foreground">{summary(level)}</span>
        <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">Hide</span>
      </summary>

      <div className="space-y-4 border-t border-white/10 px-5 py-5">
        <p className="max-w-4xl text-sm leading-6 text-foreground/90">{level.whatTheBotDoes}</p>

        <ul className="flex flex-wrap gap-2">
          {level.exampleQuestions.map((question) => (
            <li
              key={question}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-foreground/90"
            >
              {question}
            </li>
          ))}
        </ul>

        <div className="grid gap-4 lg:grid-cols-2">
          <Block title="Who writes the answer">
            <p className="font-medium text-foreground">{level.answerMadeBy}</p>
            <p className="mt-2 text-muted-foreground">{level.howAnswersAreMade}</p>
          </Block>
          <Block title="Guardrails">{level.guardrails}</Block>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="bg-white/[0.03] px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Knowledge the bot holds
              </caption>
              <tbody>
                {level.knowledge.map((item) => (
                  <tr key={item.type} className="border-t border-white/5 align-top">
                    <td className="w-44 px-4 py-2.5 font-medium text-foreground">{item.type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {item.examples}
                      <span className="mt-1 block text-xs text-sky-300/80">Held as: {item.heldAs}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Block title="What the database must have">
            <ul className="list-disc space-y-1.5 pl-5 marker:text-white/30">
              {level.databaseMustHave.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Block>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="bg-white/[0.03] px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Domains at this level, in order
            </caption>
            <tbody>
              {level.domains.map((domain, index) => (
                <tr key={domain.domain} className="border-t border-white/5 align-top">
                  <td className="w-8 px-4 py-2.5 font-mono text-xs text-muted-foreground">{index + 1}</td>
                  <td className="w-44 px-2 py-2.5 font-medium text-foreground">{domain.domain}</td>
                  <td className="w-32 px-2 py-2.5">
                    <ProgressPill progress={domain.progress} />
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground">
                    {domain.firstSlice}
                    {domain.note && <span className="mt-1 block text-xs text-foreground/70">{domain.note}</span>}
                  </td>
                  <td className="w-12 px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {domain.size ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {level.needsFromEarlier && <Block title="Needs from earlier levels">{level.needsFromEarlier}</Block>}
          <Block title="Done when">{level.doneWhen}</Block>
          <Block title="Exit test">{level.exitTest}</Block>
        </div>
      </div>
    </details>
  );
}

export function KnowledgeRoadmapView({ roadmap }: { roadmap: KnowledgeRoadmap }) {
  return (
    <div className="space-y-6">
      <p
        role="note"
        className="max-w-4xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-200"
      >
        {roadmap.caveat}
      </p>

      <Rail levels={roadmap.levels} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold">Level 0: foundations every level needs</h2>
        <ul className="mt-3 divide-y divide-white/5">
          {roadmap.foundations.map((item) => (
            <li key={item.item} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.item}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.why}</p>
              </div>
              <ProgressPill progress={item.progress} />
            </li>
          ))}
        </ul>
      </section>

      {roadmap.levels.map((level) => (
        <LevelCard key={level.level} level={level} />
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold">Not yet</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-foreground/90 marker:text-white/30">
            {roadmap.notYet.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold">Decisions only Dan can make</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-foreground/90 marker:text-white/30">
            {roadmap.decisions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
