'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAVIGATION, type ItemStatus, type NavItem } from '@/lib/navigation';

const STATUS_PILL: Record<Exclude<ItemStatus, 'ready'>, { label: string; className: string }> = {
  partial: { label: 'Partial', className: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  planned: { label: 'Planned', className: 'border-white/10 bg-white/5 text-muted-foreground' },
};

function ItemRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const pill = item.status === 'ready' ? undefined : STATUS_PILL[item.status];

  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label}</span>
      </span>
      {pill && (
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${pill.className}`}>
          {pill.label}
        </span>
      )}
    </>
  );

  // A planned item is not a link. Rendering it as one would 404, and rendering
  // nothing would hide the fact that the section is intended to exist — so it
  // is an inert row that carries its own reason in the tooltip.
  if (item.status === 'planned') {
    return (
      <span
        aria-disabled="true"
        tabIndex={-1}
        title={`Not built yet — ${item.upstream}`}
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground/50"
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      title={item.description}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
        active
          ? 'bg-sky-500/10 text-sky-300'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {body}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-background"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4">
        <Link href="/" className="block">
          <span className="block text-sm font-semibold tracking-tight">RockyGPT Dev</span>
          <span className="block text-xs text-muted-foreground">Control room</span>
        </Link>
      </div>

      <div className="flex-1 space-y-5 px-3 py-4">
        {NAVIGATION.map((section) => (
          <div key={section.id}>
            <h2 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </h2>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <ItemRow key={item.href} item={item} active={item.href === pathname} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-3 text-[11px] leading-4 text-muted-foreground/70">
        Reads the brain over HTTP. Never Neon.
      </div>
    </nav>
  );
}
