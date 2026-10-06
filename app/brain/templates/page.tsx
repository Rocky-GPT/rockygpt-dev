import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import { TextsView } from '@/components/dev/TextsView';
import { readBrainDev } from '@/lib/brain-proxy';
import type { DevRuntime } from '@/lib/brain-dev-types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Templates | RockyGPT Dev',
  description: 'The reply texts the code writes, and who picks each.',
};

export default async function TemplatesPage() {
  const { data, problem } = await readBrainDev<DevRuntime>('/v1/dev/runtime');

  return (
    <>
      <PageHeader title="Templates" subtitle="The reply texts the code writes, and who picks each" />
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
                The code writes every one of these texts, and the model writes none of them. Each
                card says who picks it: the model, the danger phrase list, or the result of an
                office lookup. Text in angle brackets is filled in by the code. How facts are
                worded (such as &ldquo;not published in the available evidence&rdquo;) and the error
                messages are not listed here.
              </p>
            </div>
            <TextsView texts={data.fixedTexts} />
          </>
        )}
      </main>
    </>
  );
}
