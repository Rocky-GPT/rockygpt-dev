import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import { type CardNode, kindColor, kindName } from '@/lib/graph-cards';
import { Photo } from './Photo';

/** The pieces every card is built from, so each type's card reads the same way. */

export type Href = (nodeId: string) => string;

export function kindStyle(kind: string): CSSProperties {
  return { '--k': kindColor(kind) } as CSSProperties;
}

export function Hero({ kind, label, visual, title, subtitle, children }: {
  kind: string;
  label?: string;
  visual: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section style={kindStyle(kind)}
      className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-border bg-[#202020] p-6 sm:flex-row sm:items-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-15"
        style={{ background: 'radial-gradient(900px 260px at 0% 0%, var(--k), transparent 70%)' }} />
      <div className="relative shrink-0">{visual}</div>
      <div className="relative min-w-0 flex-1">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--k)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--k)]">
          ● {label ?? kindName(kind)}
        </span>
        <h2 className="break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <div className="mt-1 text-[15px] text-zinc-300">{subtitle}</div>}
        {children}
      </div>
    </section>
  );
}

/** A square tile with an emoji or short text, for nodes with no photo. */
export function Tile({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <div className={`grid h-24 w-24 place-items-center rounded-3xl border-2 border-[var(--k)] bg-[#262626] text-center ${small ? 'text-xl font-extrabold leading-tight text-[var(--k)]' : 'text-5xl'}`}>
      {children}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

export function Box({ title, note, children, warn }: { title: string; note?: ReactNode; children: ReactNode; warn?: boolean }) {
  return (
    <section className={`min-w-0 rounded-2xl border bg-[#202020] p-5 ${warn ? 'border-amber-700/60' : 'border-[#303030]'}`} aria-label={title}>
      <h3 className={`mb-3 flex items-baseline justify-between gap-3 text-xs font-bold uppercase tracking-wider ${warn ? 'text-amber-300' : 'text-zinc-400'}`}>
        <span>{title}</span>
        {note !== undefined && <span className="text-right font-semibold normal-case tracking-normal text-zinc-500">{note}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A place the graph has nothing for yet. It says so, and never fills the gap with a guess. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border-[1.5px] border-dashed border-amber-400/55 bg-amber-400/[0.045] px-3.5 py-3 text-sm">
      <p className="font-semibold text-amber-200">{title}</p>
      {children && <p className="text-amber-300/80">{children}</p>}
    </div>
  );
}

export function Source({ children }: { children: ReactNode }) {
  return <p className="mt-3 break-all text-xs text-zinc-500">⛁ From: {children}</p>;
}

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'green' | 'sky' | 'amber' | 'pink' | 'rose' }) {
  const tones = {
    plain: 'border-[#3a3a3a] bg-[#2a2a2a] text-zinc-300',
    green: 'border-emerald-900 bg-emerald-950/70 text-emerald-300',
    sky: 'border-sky-900 bg-sky-950/70 text-sky-300',
    amber: 'border-amber-900 bg-amber-950/60 text-amber-300',
    pink: 'border-pink-900 bg-pink-950/60 text-pink-300',
    rose: 'border-rose-900 bg-rose-950/60 text-rose-300',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** A linked node as a pill. Every chip opens that node's own card. */
export function NodeChip({ node, href, detail, photo }: { node: CardNode; href: Href; detail?: ReactNode; photo?: boolean }) {
  return (
    <Link href={href(node.id)} prefetch={false} style={{ '--c': kindColor(node.kind) } as CSSProperties}
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#383838] bg-[#262626] py-1 pl-2 pr-3 text-[13px] text-zinc-100 hover:border-[var(--c)] hover:bg-[#2c2c2c]">
      {photo && node.brief?.image_url
        ? <Photo src={node.brief.image_url} name={node.label} className="-ml-1 h-6 w-6 rounded-full" />
        : <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--c)]" />}
      <span className="truncate">{node.label}</span>
      {detail && <span className="shrink-0 text-[11.5px] text-zinc-500">{detail}</span>}
    </Link>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** A linked node as a full-width row: a lead (code, date, photo), its name, and a detail line. */
export function NodeRow({ node, href, lead, detail, highlight }: {
  node: CardNode;
  href: Href;
  lead?: ReactNode;
  detail?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <Link href={href(node.id)} prefetch={false}
      className={`flex items-center justify-between gap-3 rounded-xl border px-2.5 py-2 hover:border-[#353535] hover:bg-[#262626] ${highlight ? 'border-[#353535] bg-[#262626]' : 'border-transparent'}`}>
      <span className="flex min-w-0 items-center gap-3">
        {lead}
        <span className="min-w-0">
          <span className="block truncate text-zinc-100">{node.label}</span>
          {detail && <span className="block truncate text-xs text-zinc-500">{detail}</span>}
        </span>
      </span>
      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-400" />
    </Link>
  );
}

/** A course code or a short date in a colored mono box, in front of a row. */
export function Code({ children, kind = 'course' }: { children: ReactNode; kind?: string }) {
  return (
    <span style={{ '--c': kindColor(kind) } as CSSProperties}
      className="min-w-[84px] shrink-0 rounded-md bg-[color-mix(in_srgb,var(--c)_14%,#1a1a1a)] px-2 py-0.5 text-center font-mono text-[12.5px] text-[var(--c)]">
      {children}
    </span>
  );
}

export function Action({ href, kind, children }: { href?: string | null; kind: 'mail' | 'phone' | 'web' | 'place'; children: ReactNode }) {
  const icon = {
    mail: <Mail className="h-3.5 w-3.5" />,
    phone: <Phone className="h-3.5 w-3.5" />,
    web: <ExternalLink className="h-3.5 w-3.5" />,
    place: <MapPin className="h-3.5 w-3.5" />,
  }[kind];
  const className = 'inline-flex max-w-full items-center gap-2 rounded-lg border border-[#3a3a3a] bg-[#262626] px-3 py-1.5 text-[13px] text-zinc-100';
  if (!href) return <span className={className}>{icon}<span className="truncate">{children}</span></span>;
  const external = kind === 'web';
  return (
    <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}
      className={`${className} hover:border-sky-500/60`}>
      {icon}<span className="truncate">{children}</span>
    </a>
  );
}

/** A dashed pill in the header for a link the graph does not have yet. */
export function MissingAction({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-amber-600/70 px-3 py-1.5 text-[13px] text-amber-300">
      <MapPin className="h-3.5 w-3.5" />{children}
    </span>
  );
}

export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-zinc-500">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">{children}</p>;
}

export function SubHead({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-3 text-xs font-semibold text-zinc-400 first:mt-0">{children}</p>;
}

/** Shows the first few items, with the rest behind a "show all" toggle that needs no script. */
export function More<T>({ items, first, render, label = 'more' }: {
  items: T[];
  first: number;
  render: (item: T, index: number) => ReactNode;
  label?: string;
}) {
  if (items.length <= first) return <>{items.map(render)}</>;
  return (
    <>
      {items.slice(0, first).map(render)}
      <details className="group">
        <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs text-sky-400 hover:underline group-open:hidden">
          + {items.length - first} {label}
        </summary>
        {items.slice(first).map((item, index) => render(item, index + first))}
      </details>
    </>
  );
}
