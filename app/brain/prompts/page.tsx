import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PromptView } from '@/components/dev/PromptView';
import { PageHeader } from '@/components/shell/PageHeader';
import type { DevRuntime } from '@/lib/brain-dev-types';
import { readBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Prompts & Models | RockyGPT Dev',
  description: 'The instructions and model behind every answer.',
};

export default async function PromptsPage() {
  const { data, problem } = await readBrainDev<DevRuntime>('/v1/dev/runtime');

  return (
    <>
      <PageHeader title="Prompts & Models" subtitle="The instructions and model behind every answer" />
      <main className="min-w-0 px-6 py-6">
        {data ? (
          <PromptView runtime={data} />
        ) : (
          <ErrorPanel title="Could not read the Brain’s runtime" detail={problem} />
        )}
      </main>
    </>
  );
}
