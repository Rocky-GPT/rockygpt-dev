import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import { TextsView } from '@/components/dev/TextsView';
import { readBrainDev } from '@/lib/brain-proxy';
import type { DevRuntime } from '@/lib/brain-dev-types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Templates | RockyGPT Dev',
  description: 'Every text the code writes itself.',
};

export default async function TemplatesPage() {
  const { data, problem } = await readBrainDev<DevRuntime>('/v1/dev/runtime');

  return (
    <>
      <PageHeader title="Templates" subtitle="Every text the code writes itself" />
      <main className="min-w-0 space-y-4 px-6 py-6">
        {!data ? (
          <ErrorPanel title="Could not read the Brain's texts" detail={problem} />
        ) : (
          <>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {data.fixedTexts.length} {data.fixedTexts.length === 1 ? 'text' : 'texts'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The model chooses which of these to use; it writes none of them. Text in angle
                brackets is filled in by the code.
              </p>
            </div>
            <TextsView texts={data.fixedTexts} />
          </>
        )}
      </main>
    </>
  );
}
