import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { DocumentBrowser } from '@/components/DocumentBrowser';

export const metadata: Metadata = {
  title: 'Documents | RockyGPT Dev',
  description: 'Official campus handbooks, policies, catalogs, and source documents stored in PostgreSQL',
};

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Official campus handbooks, policies, catalogs, and source documents stored in PostgreSQL"
      />
      <main className="min-w-0 px-6 py-6">
        <DocumentBrowser />
      </main>
    </>
  );
}
