import type { Metadata } from 'next';
import { KnowledgeRoadmapView } from '@/components/dev/KnowledgeRoadmapView';
import { PageHeader } from '@/components/shell/PageHeader';
import { KNOWLEDGE_ROADMAP } from '@/lib/knowledge-roadmap';

export const metadata: Metadata = {
  title: 'Knowledge Roadmap | RockyGPT Dev',
  description: 'What the bot may do with data at each level, and the knowledge each level needs.',
};

export default function KnowledgeRoadmapPage() {
  const levels = KNOWLEDGE_ROADMAP.levels.length;
  return (
    <>
      <PageHeader
        title="Knowledge Roadmap"
        subtitle={`${levels} levels of what the bot does with data · written ${KNOWLEDGE_ROADMAP.asOf}`}
      />
      <main className="min-w-0 space-y-6 px-6 py-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Each level says who writes the answer and what kind of knowledge the bot and its database
          must hold to do it. A level opens only when the one before it passes its exit test. This
          page is written from the data audit and is not read from the Brain.
        </p>
        <KnowledgeRoadmapView roadmap={KNOWLEDGE_ROADMAP} />
      </main>
    </>
  );
}
