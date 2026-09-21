'use client';

import { AlertTriangle, ExternalLink, FileText } from 'lucide-react';
import { JsonViewer } from '@/components/JsonViewer';
import {
  SECTIONS, componentState, displayValue, recordsForSection, safeSourceUrl,
  type ProfileResponse, type ProfileSection,
} from '@/lib/identities';

const toneClasses = {
  good: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  muted: 'border-white/10 bg-white/5 text-muted-foreground',
};

export function ProfileEvidence({ data, section, onSection }: {
  data: ProfileResponse;
  section: ProfileSection;
  onSection: (section: ProfileSection) => void;
}) {
  const profile = data.profile;
  const component = profile.components[section];
  const records = recordsForSection(profile, section);
  const state = componentState(component);
  const label = SECTIONS.find(item => item.key === section)?.label;
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/35" aria-label="Profile evidence">
    <div className="border-b border-white/10 p-4 sm:p-5">
      <h2 className="text-base font-semibold">Inspect the evidence</h2>
      <p className="mt-1 text-xs text-muted-foreground">Values stay with their original sources. A link does not decide which source is right.</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Profile sections">
        {SECTIONS.map(item => {
          const status = componentState(profile.components[item.key]);
          return <button key={item.key} type="button" aria-pressed={section === item.key} onClick={() => onSection(item.key)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${section === item.key ? 'border-sky-400/50 bg-sky-400/10 text-sky-200' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.tone === 'good' ? 'bg-emerald-400' : status.tone === 'warn' ? 'bg-amber-300' : 'bg-neutral-600'}`} />
            {item.label}<span className="sr-only">: {status.label}</span>
          </button>;
        })}
      </div>
    </div>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">{label}</h3>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${toneClasses[state.tone]}`}>{state.label}</span>
        {component && <span className="text-xs text-muted-foreground">{component.returned_count} shown · {component.total_matches} matching</span>}
      </div>
      {section === 'hours' && <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-sky-100/80">Operating hours do not establish staff or phone availability. Missing hours mean unknown, not closed.</p>}
      {section === 'courses' && <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-sky-100/80">Faculty course lists are undated. A catalog link does not establish a current-semester teaching assignment.</p>}
      {component?.service_date && <p className="text-xs text-muted-foreground">Service date: <span className="text-foreground">{component.service_date}</span> · America/New_York{component.meal ? ` · ${component.meal}` : ' · All meals'}</p>}
      {!!component?.omitted_count && <p className="text-xs text-amber-200">Showing a sample: {component.omitted_count} matching records are omitted. This is not the full menu.</p>}
      {!!component && (component.failed_links > 0 || component.linked_records_missing > 0 || component.relationships_missing > 0) && <p role="status" className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{component.linked_records_missing} missing records · {component.relationships_missing} unresolved relationships · {component.failed_links} failed lookups. Available evidence is shown below.</p>}
      {component && Object.entries(component.conflicts).map(([field, values]) => <div key={field} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <h4 className="text-sm font-medium text-amber-200">Conflicting {field.replaceAll('_', ' ')} values</h4>
        <ul className="mt-2 space-y-2 text-xs">{values.map((value, index) => <li key={index} className="space-y-1">
          <p className="whitespace-pre-wrap break-words font-mono">{displayValue(value.value)}</p>
          <p className="break-all text-muted-foreground">{value.evidence_ids.map(id => {
            const record = records.find(item => item.id === id);
            return record ? `${record.source_title} · ${id}` : id;
          }).join(' / ')}</p>
        </li>)}</ul>
      </div>)}
      {!records.length && <div className="rounded-xl border border-dashed border-white/15 px-5 py-8 text-center">
        <FileText className="mx-auto mb-3 h-6 w-6 text-neutral-500" />
        <p className="text-sm">No linked evidence for this section{component?.service_date ? ' on the selected date' : ''}.</p>
        <p className="mt-1 text-xs text-muted-foreground">Other available sections remain usable. This does not prove the information does not exist.</p>
        {component?.reason && <p className="mt-3 font-mono text-[11px] text-muted-foreground">{component.reason}</p>}
      </div>}
      <div className="space-y-3">{records.map(record => {
        const source = safeSourceUrl(record.url);
        return <article key={record.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 p-4">
            <div className="min-w-0 flex-1"><h4 className="break-words text-sm font-semibold">{record.title}</h4><p className="mt-1 text-xs text-muted-foreground">{record.source_title} · {record.collection}</p></div>
            {source && <a href={source} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-xs text-sky-300 hover:underline">Source <ExternalLink className="h-3 w-3" /><span className="sr-only"> for {record.title}</span></a>}
          </div>
          <dl className="divide-y divide-white/5 px-4">{Object.entries(record.fields).map(([key, value]) => <div key={key} className="grid gap-1 py-2.5 text-xs sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
            <dt className="text-muted-foreground">{key.replaceAll('_', ' ')}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words leading-5">{displayValue(value)}</dd>
          </div>)}</dl>
          <div className="border-t border-white/5 bg-black/10 px-4 py-3 text-[11px] text-muted-foreground">
            <p className="break-all font-mono">Original evidence ID: {record.id}</p>
            <p className="mt-1">Source collected: {record.collected_at ?? 'Not published'} · Freshness: {record.freshness}</p>
            {record.limitations.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-100/75">{record.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}
          </div>
        </article>;
      })}</div>
    </div>
    <JsonViewer data={data} title="Exact profile response" downloadFileName={`profile-${profile.resolution.entity?.id ?? 'unresolved'}.json`} />
  </section>;
}
