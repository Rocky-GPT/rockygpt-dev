import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { IdentityExplorer } from '@/components/identities/IdentityExplorer';

export const metadata: Metadata = {
  title: 'Campus Graph | RockyGPT Dev',
  description: 'Explore campus identities, original source records and explicit relationships.',
};

export default function EntitiesPage() {
  return <>
    <PageHeader title="Campus Graph" subtitle="Explore Ramapo College through identities, explicit relationships, and original source records." />
    <main className="min-w-0 p-4 lg:p-6"><IdentityExplorer /></main>
  </>;
}
