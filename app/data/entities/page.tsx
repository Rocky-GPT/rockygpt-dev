import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { IdentityExplorer } from '@/components/identities/IdentityExplorer';

export const metadata: Metadata = {
  title: 'Identity Explorer | RockyGPT Dev',
  description: 'Explore campus identities, original source records and explicit relationships.',
};

export default function EntitiesPage() {
  return <>
    <PageHeader title="Identity Explorer" subtitle="One identity. Connected records. Sources you can inspect." />
    <main className="min-w-0 p-4 lg:p-6"><IdentityExplorer /></main>
  </>;
}
