'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, GitBranch, Loader2, RefreshCw, Search } from 'lucide-react';
import { IdentityConnections } from './IdentityConnections';
import { IdentityWeb } from './IdentityWeb';
import { GraphDownload } from './GraphDownload';
import { ProfileEvidence } from './ProfileEvidence';
import { JsonViewer } from '@/components/JsonViewer';
import { defaultProfileSection, KIND_LABELS, profileQueryParams, profileSelectionFilters, publishedMealLabels, type IdentityIndex, type ProfileResponse, type ProfileSection } from '@/lib/identities';

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 409
    ? 'The active data release changed. Reload identities to inspect a matching profile.'
    : data.error ?? data.detail ?? `The Brain returned HTTP ${response.status}.`);
  return data as T;
}

export function IdentityExplorer() {
  const [index, setIndex] = useState<IdentityIndex>();
  const [indexError, setIndexError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [identityLimit, setIdentityLimit] = useState(40);
  const [tab, setTab] = useState<'connections' | 'unresolved'>('connections');
  const [issueLimit, setIssueLimit] = useState(50);
  const [date, setDate] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [meal, setMeal] = useState('');
  const [section, setSection] = useState<ProfileSection>('contact');
  const [profile, setProfile] = useState<ProfileResponse>();
  const [profileKey, setProfileKey] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const evidence = useRef<HTMLDivElement>(null);
  const selected = index?.identities.find(entity => entity.id === selectedId);
  const selectedKind = selected?.kind;
  const isEvent = selectedKind === 'event';
  const usesEventDate = isEvent || selectedKind === 'club';
  const dateLabel = isEvent ? 'Occurrence date filter' : usesEventDate ? 'Event date filter' : 'Campus service date';
  const { date: profileDate, meal: profileMeal } = profileSelectionFilters(selectedKind, date, meal, eventDate);
  const selectionKey = JSON.stringify([selectedId, profileDate, profileMeal, index?.identity_hash]);
  const mealOptions = [...new Set([...publishedMealLabels(profile?.profile), ...(meal ? [meal] : [])])];

  useEffect(() => {
    const controller = new AbortController();
    setIndex(undefined); setIndexError(''); setProfile(undefined);
    getJson<IdentityIndex>('/api/brain/identities', controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setIndex(data); setDate(data.campus_date);
      const requested = new URLSearchParams(window.location.search).get('entity');
      const initial = data.identities.find(entity => entity.id === requested);
      if (initial) { setSelectedId(initial.id); setSection(defaultProfileSection(initial.kind)); setEventDate(''); }
      else setSelectedId('');
    }).catch(error => { if (!controller.signal.aborted) setIndexError(error instanceof Error ? error.message : 'Could not load identities.'); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!index || !selectedId || !selectedKind || (!usesEventDate && !profileDate)) return;
    const controller = new AbortController();
    setProfile(undefined); setProfileError(''); setProfileLoading(true);
    const params = profileQueryParams(selectedKind, index.dataset_version, profileDate, profileMeal);
    getJson<ProfileResponse>(`/api/brain/identities/${encodeURIComponent(selectedId)}?${params}`, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.identity_hash !== index.identity_hash) throw new Error('Identity links changed. Reload identities before inspecting this profile.');
      setProfile(data); setProfileKey(selectionKey);
    }).catch(error => { if (!controller.signal.aborted) setProfileError(error instanceof Error ? error.message : 'Could not load profile.'); })
      .finally(() => { if (!controller.signal.aborted) setProfileLoading(false); });
    return () => controller.abort();
  }, [index, selectedId, selectedKind, usesEventDate, profileDate, profileMeal, selectionKey]);

  const identities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (index?.identities ?? []).filter(entity => [entity.name, entity.id, ...entity.aliases].some(value => value.toLowerCase().includes(q)));
  }, [index, query]);
  const issues = (index?.coverage?.unresolved ?? []).filter(issue =>
    [issue.entity, issue.collection, issue.record, issue.reason].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const selectedIssues = index?.coverage?.unresolved.filter(issue => issue.entity === selected?.name) ?? [];
  const links = index?.identities.reduce((sum, entity) => sum + entity.links.reduce((count, link) => count + link.source_record_keys.length, 0), 0) ?? 0;
  const relationshipCount = index?.identities.reduce((sum, entity) => sum + entity.relationships.length, 0) ?? 0;

  function selectEntity(id: string, resetGraph = true) {
    if (resetGraph) setNavigationEpoch(value => value + 1);
    if (id === selectedId) return;
    const entity = index?.identities.find(item => item.id === id);
    if (!entity) return;
    setSelectedId(id); setSection(defaultProfileSection(entity.kind)); setEventDate(''); setProfile(undefined); setProfileError('');
    const url = new URL(window.location.href); url.searchParams.set('entity', id);
    window.history.replaceState(null, '', url);
  }

  function clearSelection() {
    setSelectedId(''); setProfile(undefined); setProfileError(''); setProfileLoading(false); setEventDate('');
    const url = new URL(window.location.href); url.searchParams.delete('entity');
    window.history.replaceState(null, '', url);
  }

  function inspectSection(value: ProfileSection) {
    setSection(value); evidence.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (indexError) return <div role="alert" className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-6">
    <h2 className="font-semibold">Campus Graph is unavailable</h2><p className="mt-2 text-sm text-muted-foreground">{indexError}</p>
    <p className="mt-2 text-xs text-muted-foreground">This view requires the development Brain and an identity data release.</p>
    <button type="button" onClick={() => setReload(value => value + 1)} className="mt-4 rounded-lg border border-white/20 px-3 py-2 text-sm">Try again</button>
  </div>;
  if (!index) return <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/10 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the active identity map…</div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="flex items-center gap-2 text-xs text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live development data</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{index.dataset_version}</p></div>
      <div className="flex flex-wrap items-start gap-3">
        <GraphDownload index={index} />
        <button type="button" onClick={() => setReload(value => value + 1)} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" />Reload identities</button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Identities', index.identities.length, 'Persistent campus identities'], ['Linked records', links, 'Original records, kept separate'], ['Relationships', relationshipCount, 'Explicit, evidence-backed links'], ['Unresolved issues', index.coverage?.unresolved.length ?? '—', 'Evidence still needed']].map(([label, count, description]) =>
        <div key={label} className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-4"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{typeof count === 'number' ? count.toLocaleString() : count}</p><p className="mt-1 text-[11px] text-muted-foreground">{description}</p></div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div className="flex gap-1 rounded-lg bg-black/20 p-1" role="tablist" aria-label="Explorer views">
        <button type="button" id="connections-tab" role="tab" aria-selected={tab === 'connections'} aria-controls="connections-panel" onClick={() => { setTab('connections'); setQuery(''); }} className={`rounded-md px-3 py-2 text-xs ${tab === 'connections' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}>Connections</button>
        <button type="button" id="unresolved-tab" role="tab" aria-selected={tab === 'unresolved'} aria-controls="unresolved-panel" onClick={() => { setTab('unresolved'); setQuery(''); }} className={`rounded-md px-3 py-2 text-xs ${tab === 'unresolved' ? 'bg-white/10 text-white' : 'text-muted-foreground'}`}>Unresolved {index.coverage ? `(${index.coverage.unresolved.length})` : ''}</button>
      </div>
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><GitBranch className="h-3.5 w-3.5" />Identity links are not an authority ranking</p>
    </div>
    {tab === 'connections' ? <div id="connections-panel" role="tabpanel" aria-labelledby="connections-tab" className="grid min-w-0 items-start gap-5">
      <div className="min-w-0 space-y-5">
        <IdentityWeb key={`${index.dataset_version}:${index.identity_hash}`} datasetVersion={index.dataset_version} identityHash={index.identity_hash} navigationEpoch={navigationEpoch} entity={selected} identities={index.identities} profile={profile && profileKey === selectionKey ? profile : undefined} onSelectEntity={id => { setQuery(''); selectEntity(id, false); }} onSection={inspectSection} onClearSelection={clearSelection} search={
          <div className="relative w-full sm:w-80" onFocus={() => setSearchFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchFocused(false); }}>
            <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="Search identities" placeholder="Search names, aliases, IDs…" value={query} onChange={event => { setQuery(event.target.value); setIdentityLimit(40); }} onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); setSearchFocused(false); } }} className="min-w-0 flex-1 bg-transparent py-2.5 text-xs outline-none" /></label>
            {searchFocused && query.trim() && <div role="region" aria-label="Identity search results" className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-neutral-950 shadow-xl">
              <p className="border-b border-white/10 px-3 py-2 text-[11px] text-muted-foreground">{identities.length} matching identities</p>
              {identities.slice(0, identityLimit).map(entity => <button key={entity.id} type="button" onClick={() => { selectEntity(entity.id); setQuery(''); setSearchFocused(false); }} className="block w-full border-b border-white/5 px-3 py-2.5 text-left hover:bg-white/5 focus-visible:bg-white/10"><span className="block truncate text-xs font-medium">{entity.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{KIND_LABELS[entity.kind]}</span></button>)}
              {identities.length > identityLimit && <button type="button" onClick={() => setIdentityLimit(value => value + 40)} className="w-full px-3 py-2.5 text-left text-xs text-sky-200 hover:bg-white/5">Show 40 more identities</button>}
              {!identities.length && <p className="p-3 text-xs text-muted-foreground">No matching identity.</p>}
            </div>}
          </div>
        } />
        {selected ? <>
        <details className="rounded-xl border border-white/10"><summary className="cursor-pointer px-4 py-3 text-xs text-muted-foreground">Record and relationship list for {selected.name}</summary><IdentityConnections entity={selected} identities={index.identities} onSelectEntity={id => { setQuery(''); selectEntity(id); }} onSection={inspectSection} /></details>
        {selectedIssues.length > 0 && <details className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs"><summary className="cursor-pointer text-amber-200">{selectedIssues.length} unresolved issue{selectedIssues.length === 1 ? '' : 's'} for this identity</summary><ul className="mt-3 space-y-3">{selectedIssues.map((issue, position) => <li key={position}><p className="font-medium">{issue.record}</p><p className="mt-1 leading-5 text-muted-foreground">{issue.reason}</p></li>)}</ul></details>}
        <div ref={evidence} className="scroll-mt-24 space-y-4">
          <form key={`${selectedId}|${profileDate}|${profileMeal}`} onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const nextDate = String(form.get('date') ?? '');
            if (usesEventDate) setEventDate(nextDate);
            else if (nextDate) { setDate(nextDate); setMeal(String(form.get('meal') ?? '')); }
          }} className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 p-4">
            <label className="space-y-1.5 text-xs text-muted-foreground"><span className="block">{dateLabel}{usesEventDate ? ' (optional)' : ''}</span><input type="date" name="date" required={!usesEventDate} aria-label={dateLabel} defaultValue={profileDate} className="rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-foreground [color-scheme:dark]" /></label>
            {!usesEventDate && <label className="space-y-1.5 text-xs text-muted-foreground"><span className="block">Meal</span><select name="meal" aria-label="Meal" defaultValue={meal} className="rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-foreground"><option value="">All meals</option>{mealOptions.map(label => <option key={label}>{label}</option>)}</select></label>}
            <button type="submit" className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-400/20">{isEvent ? 'Apply occurrence date' : usesEventDate ? 'Apply event date' : 'Apply date & meal'}</button>
            <p className="pb-2 text-[11px] text-muted-foreground">{usesEventDate ? 'America/New_York · Leave blank to include linked occurrences across dates' : 'America/New_York · Applies to hours and menus'}</p>
          </form>
          {profileLoading && <p role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Assembling linked evidence…</p>}
          {profileError && <div role="alert" className="flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{profileError}</div>}
          {profile && profileKey === selectionKey && !profileLoading && <ProfileEvidence data={profile} section={section} onSection={setSection} />}
        </div>
        <JsonViewer data={selected} title="Identity links and relationship evidence" downloadFileName={`identity-${selected.id}.json`} />
        </> : <p className="rounded-xl border border-dashed border-white/10 p-5 text-xs text-muted-foreground">Select a campus identity to inspect its original source records and selectively assembled profile.</p>}
      </div>
    </div> : <section id="unresolved-panel" role="tabpanel" aria-labelledby="unresolved-tab" className="space-y-4">
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"><h2 className="text-sm font-semibold text-amber-100">Connections that need more evidence</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">These are issue entries, not missing people. Undated course titles stay usable as lists even when a catalog link cannot be approved. Original unlinked records remain searchable.</p></div>
      <input aria-label="Search unresolved issues" value={query} onChange={event => { setQuery(event.target.value); setIssueLimit(50); }} placeholder="Search an identity, record or reason…" className="w-full rounded-lg border border-white/15 bg-neutral-950/40 px-4 py-3 text-sm" />
      <p className="text-xs text-muted-foreground">Showing {Math.min(issueLimit, issues.length)} of {issues.length} matching issue entries</p>
      {!index.coverage && <p className="text-sm text-muted-foreground">This release does not publish a coverage report. Missing coverage is not proof that every link is resolved.</p>}
      <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">{issues.slice(0, issueLimit).map((issue, position) => <article key={position} className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><div><p className="text-xs font-medium">{issue.entity ?? 'Unlinked source record'}</p><p className="mt-1 break-words text-xs text-muted-foreground">{issue.record}</p><span className="mt-2 inline-block rounded bg-white/5 px-2 py-1 text-[10px]">{issue.collection}</span></div><p className="text-xs leading-5 text-muted-foreground">{issue.reason}</p></article>)}</div>
      {issues.length > issueLimit && <button type="button" onClick={() => setIssueLimit(value => value + 50)} className="rounded-lg border border-white/15 px-4 py-2 text-xs">Show 50 more issues</button>}
      {index.coverage && issues.length === 0 && <p className="p-5 text-sm text-muted-foreground">No issue entries match this search.</p>}
    </section>}
    <p className="break-all font-mono text-[10px] text-muted-foreground/70">Identity artifact SHA-256: {index.identity_hash}</p>
  </div>;
}
