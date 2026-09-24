import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { RecordsBrowser } from '@/components/RecordsBrowser';
import { brainAddress } from '@/lib/brain-address';

export const metadata: Metadata = {
  title: 'Records | RockyGPT Dev',
  description: 'What each capability returns when nothing narrows it',
};

// A failed read used to return [], which the explorer drew as a lookup that
// never finished ("Looking it up…"). The reason travels with the result.
async function getCapabilities(): Promise<{ capabilities: string[]; problem?: string }> {
  const { url } = brainAddress();
  if (!url) return { capabilities: [], problem: 'BRAIN_URL is not set in this environment.' };
  try {
    const res = await fetch(`${url}/v1/capabilities`, { cache: 'no-store' });
    if (!res.ok) return { capabilities: [], problem: `The Brain answered HTTP ${res.status}.` };
    const data = await res.json();
    return { capabilities: (data.capabilities || [])
      .map((c: { capability: string }) => c.capability)
      .filter((capability: string) => capability !== 'documents') };
  } catch {
    return { capabilities: [], problem: 'The Brain is not reachable.' };
  }
}

export default async function RecordsPage(props: {
  searchParams: Promise<{ capability?: string; tag?: string }>;
}) {
  const [{ capabilities, problem }, searchParams] = await Promise.all([
    getCapabilities(),
    props.searchParams,
  ]);
  const initialCapability = searchParams?.capability || searchParams?.tag;

  return (
    <>
      <PageHeader
        title="Records"
        subtitle="What each capability returns when nothing narrows it"
      />
      <main className="min-w-0 px-6 py-6">
        {problem ? (
          <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Capabilities could not be loaded. {problem}
          </p>
        ) : (
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-white/10" />
                ))}
              </div>
            </div>
          }
        >
          <RecordsBrowser
            capabilities={capabilities}
            initialCapability={initialCapability}
          />
        </Suspense>
        )}
      </main>
    </>
  );
}
