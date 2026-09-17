import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { RecordsBrowser } from '@/components/RecordsBrowser';
import { brainAddress } from '@/lib/brain-address';

export const metadata: Metadata = {
  title: 'Records | RockyGPT Dev',
  description: 'What each capability returns when nothing narrows it',
};

async function getCapabilities(): Promise<string[]> {
  const { url } = brainAddress();
  if (!url) return [];
  try {
    const res = await fetch(`${url}/v1/capabilities`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.capabilities || []).map((c: { capability: string }) => c.capability);
  } catch {
    return [];
  }
}

export default async function RecordsPage() {
  const capabilities = await getCapabilities();

  return (
    <>
      <PageHeader
        title="Records"
        subtitle="What each capability returns when nothing narrows it"
      />
      <main className="min-w-0 px-6 py-6">
        <RecordsBrowser capabilities={capabilities} />
      </main>
    </>
  );
}
