'use client';

import { useId, useState, type CSSProperties } from 'react';
import {
  ArrowDown, ArrowUpRight, BookOpen, Building2, ChevronDown, ChevronUp,
  Clock3, ContactRound, Database, Fingerprint, GraduationCap, Landmark,
  Link2, Network, UserRound, Utensils, type LucideIcon,
} from 'lucide-react';
import type { Identity, ProfileSection } from '@/lib/identities';

type Props = {
  entity: Identity;
  identities: Identity[];
  onSection: (section: ProfileSection) => void;
  onSelectEntity: (id: string) => void;
};

const COLLECTIONS: Record<string, { label: string; section: ProfileSection; icon: LucideIcon }> = {
  contacts: { label: 'Contact records', section: 'contact', icon: ContactRound },
  faculty: { label: 'Faculty profiles', section: 'faculty', icon: GraduationCap },
  campus_hours: { label: 'Campus schedules', section: 'hours', icon: Clock3 },
  dining_hours: { label: 'Dining schedules', section: 'hours', icon: Clock3 },
  menu: { label: 'Menu offerings', section: 'menu', icon: Utensils },
  programs: { label: 'Program records', section: 'program', icon: BookOpen },
  courses: { label: 'Catalog courses', section: 'courses', icon: BookOpen },
};
const KIND_ICONS: Record<string, LucideIcon> = {
  person: UserRound, office: Landmark, facility: Building2, venue: Utensils, program: GraduationCap,
};
const VISIBLE_RELATIONSHIPS = 6;
const NODE_HEIGHT = 76;
const NODE_GAP = 12;
const number = (value: number) => value.toLocaleString('en-US');

type RelatedNode = {
  key: string;
  name: string;
  label: string;
  detail: string;
  entityId?: string;
  section: ProfileSection;
  icon: LucideIcon;
};

function relatedNodes(entity: Identity, identities: Identity[]): RelatedNode[] {
  const byId = new Map(identities.map((identity) => [identity.id, identity]));
  const nodes = new Map<string, RelatedNode>();
  for (const relationship of entity.relationships ?? []) {
    if (relationship.type === 'convener' && relationship.target_entity_id) {
      const target = byId.get(relationship.target_entity_id);
      const key = `convener:${relationship.target_entity_id}`;
      nodes.set(key, {
        key, name: target?.name ?? 'Person identity unavailable', label: 'Has convener',
        detail: target ? 'Person identity' : 'View published relationship evidence',
        entityId: target?.id, section: 'conveners', icon: UserRound,
      });
    } else if (relationship.type === 'profile_course' && relationship.target_record) {
      const target = relationship.target_record;
      const key = `course:${target.source_key}:${target.source_record_key}`;
      nodes.set(key, {
        key, name: target.source_record_key, label: 'Profile-listed course',
        detail: 'Undated list · catalog link', section: 'courses', icon: BookOpen,
      });
    }
  }
  for (const candidate of identities) {
    if ((candidate.relationships ?? []).some((relationship) =>
      relationship.type === 'convener' && relationship.target_entity_id === entity.id)) {
      const key = `convener-of:${candidate.id}`;
      nodes.set(key, {
        key, name: candidate.name, label: 'Convener of', detail: 'Program identity',
        entityId: candidate.id, section: 'conveners', icon: GraduationCap,
      });
    }
  }
  return [...nodes.values()];
}

function ConnectorRail({ count, height, side }: { count: number; height: number; side: 'source' | 'relationship' }) {
  if (!count) return <div className="hidden @min-[740px]:block" />;
  const occupied = count * NODE_HEIGHT + Math.max(0, count - 1) * NODE_GAP;
  const first = (height - occupied) / 2 + NODE_HEIGHT / 2;
  return (
    <div className="relative hidden self-stretch @min-[740px]:block" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 36 ${height}`} preserveAspectRatio="none" fill="none">
        {Array.from({ length: count }, (_, index) => {
          const position = first + index * (NODE_HEIGHT + NODE_GAP);
          const start = side === 'source' ? position : height / 2;
          const end = side === 'source' ? height / 2 : position;
          return <path key={index} d={`M 0 ${start} C 18 ${start}, 18 ${end}, 36 ${end}`}
            stroke={side === 'source' ? '#38bdf8' : '#2dd4bf'} strokeOpacity="0.5"
            strokeWidth="1.5" strokeDasharray={side === 'relationship' ? '3 4' : undefined} />;
        })}
        <circle cx={side === 'source' ? 36 : 0} cy={height / 2} r="3" fill={side === 'source' ? '#38bdf8' : '#2dd4bf'} />
      </svg>
    </div>
  );
}

export function IdentityConnections({ entity, identities, onSection, onSelectEntity }: Props) {
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const listId = useId();
  const expanded = expandedEntity === entity.id;
  const collections = new Map<string, { sources: Set<string>; records: Set<string> }>();
  for (const link of entity.links) {
    const group = collections.get(link.collection) ?? { sources: new Set<string>(), records: new Set<string>() };
    group.sources.add(link.source_key);
    for (const key of link.source_record_keys) group.records.add(`${link.source_key}:${key}`);
    collections.set(link.collection, group);
  }
  const sources = [...collections.entries()];
  const relationships = relatedNodes(entity, identities);
  const visible = relationships.slice(0, VISIBLE_RELATIONSHIPS);
  const remaining = relationships.slice(VISIBLE_RELATIONSHIPS);
  const height = Math.max(350, Math.max(sources.length, visible.length) * (NODE_HEIGHT + NODE_GAP) - NODE_GAP);
  const IdentityIcon = KIND_ICONS[entity.kind] ?? Network;
  const recordCount = sources.reduce((total, [, group]) => total + group.records.size, 0);

  const renderRelationship = (node: RelatedNode) => {
    const Icon = node.icon;
    return (
      <button key={node.key} type="button"
        onClick={() => node.entityId ? onSelectEntity(node.entityId) : onSection(node.section)}
        title={`${node.label}: ${node.name}. ${node.detail}.`}
        className="group flex h-[76px] w-full items-center gap-3 rounded-xl border border-dashed border-teal-400/30 bg-teal-950/20 px-3 text-left transition-colors hover:border-teal-300/60 hover:bg-teal-950/40">
        <Icon className="h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-teal-300/90">{node.label}</span>
          <span className="block truncate text-sm font-medium text-neutral-100">{node.name}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{node.detail}</span>
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-teal-300/50 transition-colors group-hover:text-teal-200" aria-hidden="true" />
      </button>
    );
  };

  return (
    <section className="@container overflow-hidden rounded-2xl border border-sky-400/15 bg-neutral-950/60" aria-label={`Connections for ${entity.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Network className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-neutral-100">Identity connections</h2>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground" aria-label="Connection legend">
          <span className="flex items-center gap-1.5"><span className="w-5 border-t border-sky-400" />Original records</span>
          <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-teal-400" />Explicit relationships</span>
        </div>
      </div>

      <div className="px-5 pt-5 pb-4">
        <div className="hidden grid-cols-[minmax(0,1fr)_36px_minmax(180px,1fr)_36px_minmax(0,1fr)] gap-x-0 pb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground @min-[740px]:grid" aria-hidden="true">
          <span>Original records · {number(recordCount)}</span><span />
          <span className="text-center text-sky-300">One persistent identity</span><span />
          <span>Relationships · {number(relationships.length)}</span>
        </div>

        <div className="grid grid-cols-1 gap-y-4 @min-[740px]:min-h-[var(--graph-height)] @min-[740px]:grid-cols-[minmax(0,1fr)_36px_minmax(180px,1fr)_36px_minmax(0,1fr)]"
          style={{ '--graph-height': `${height}px` } as CSSProperties}>
          <div className="flex flex-col justify-center gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground @min-[740px]:hidden">Linked original records · {number(recordCount)}</p>
            {sources.map(([collection, group]) => {
              const definition = COLLECTIONS[collection];
              const Icon = definition?.icon ?? Database;
              return <button key={collection} type="button" disabled={!definition}
                onClick={() => definition && onSection(definition.section)}
                title={`${number(group.records.size)} original record keys from ${[...group.sources].join(', ')}`}
                className="group flex h-[76px] w-full items-center gap-3 rounded-xl border border-sky-400/25 bg-sky-950/20 px-3 text-left transition-colors hover:border-sky-300/60 hover:bg-sky-950/40 disabled:cursor-default disabled:opacity-60">
                <Icon className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-100">{definition?.label ?? collection.replaceAll('_', ' ')}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {collection === 'menu' ? 'Offerings at this venue' : [...group.sources].join(' · ')}
                  </span>
                </span>
                <span className="rounded-md border border-sky-300/10 bg-sky-400/10 px-2 py-1 font-mono text-xs text-sky-200">{number(group.records.size)}</span>
              </button>;
            })}
            {!sources.length && <p className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">No original records linked in this registry.</p>}
          </div>

          <ConnectorRail count={sources.length} height={height} side="source" />

          <div className="flex flex-col justify-center">
            <ArrowDown className="mx-auto mb-3 h-4 w-4 text-sky-400/60 @min-[740px]:hidden" aria-hidden="true" />
            <div className="relative rounded-2xl border border-sky-300/40 bg-gradient-to-b from-sky-950/70 to-neutral-950 p-5 shadow-[0_0_45px_-20px_rgba(56,189,248,0.45)]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="rounded-lg border border-sky-300/20 bg-sky-400/10 p-2"><IdentityIcon className="h-5 w-5 text-sky-200" aria-hidden="true" /></span>
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-sky-200">{entity.kind}</span>
              </div>
              <h3 className="break-words text-lg leading-6 font-semibold tracking-tight text-white">{entity.name}</h3>
              <div className="mt-4 border-t border-sky-300/10 pt-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] text-sky-200/70"><Fingerprint className="h-3 w-3" aria-hidden="true" />Persistent identity ID</p>
                <p className="break-all font-mono text-[10px] leading-4 text-sky-100/85">{entity.id}</p>
              </div>
              {entity.aliases.length > 0 && <div className="mt-4">
                <p className="mb-2 text-[10px] text-muted-foreground">Published aliases</p>
                <div className="flex flex-wrap gap-1.5">
                  {entity.aliases.slice(0, 3).map((alias) => <span key={alias} title={alias} className="max-w-full truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-300">{alias}</span>)}
                  {entity.aliases.length > 3 && <span title={entity.aliases.slice(3).join(', ')} className="py-0.5 text-[10px] text-muted-foreground">+{entity.aliases.length - 3} more</span>}
                </div>
              </div>}
            </div>
            {visible.length > 0 && <ArrowDown className="mx-auto mt-3 h-4 w-4 text-teal-400/60 @min-[740px]:hidden" aria-hidden="true" />}
          </div>

          <ConnectorRail count={visible.length} height={height} side="relationship" />

          <div className="flex flex-col justify-center gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground @min-[740px]:hidden">Explicit relationships · {number(relationships.length)}</p>
            {visible.map(renderRelationship)}
            {!relationships.length && <div className="rounded-xl border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground"><Link2 className="mb-2 h-4 w-4 text-neutral-500" aria-hidden="true" />No explicit relationships published for this identity.</div>}
          </div>
        </div>

        {remaining.length > 0 && <div className="mt-4 border-t border-white/[0.06] pt-4">
          <button type="button" aria-expanded={expanded} aria-controls={listId}
            onClick={() => setExpandedEntity(expanded ? null : entity.id)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-xs text-teal-200 transition-colors hover:bg-teal-400/5">
            <span>{expanded ? 'Hide' : 'Show'} {number(remaining.length)} more relationships <span className="text-muted-foreground">· {visible.length} shown in diagram</span></span>
            {expanded ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>
          <div id={listId} hidden={!expanded}>
            <div className="mt-3 grid gap-3 @min-[540px]:grid-cols-2 @min-[1000px]:grid-cols-3">{remaining.map(renderRelationship)}</div>
          </div>
        </div>}
      </div>

      <div className="flex gap-2 border-t border-white/[0.06] bg-black/10 px-5 py-3 text-[11px] leading-5 text-muted-foreground">
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300/60" aria-hidden="true" />
        <p>Counts are linked original record keys, before date or meal filtering. Records retain their own sources; relationships do not establish shared hours or availability.</p>
      </div>
    </section>
  );
}
