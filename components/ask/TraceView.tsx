'use client';

import Link from 'next/link';
import { brainTrace } from '@/lib/brain-metrics';
import { campusGraphHref } from '@/lib/campus-graph-link';
import { factPacketOf } from '@/lib/fact-packet';
import type { Turn } from './types';
import { PacketSteps } from './PacketSteps';

/** The Fact Packet the Brain sent for this turn, step by step. */
export function PacketTab({ turn }: { turn: Turn }) {
  const packet = factPacketOf(turn.raw);
  return (
    <div className="px-5 py-4">
      {packet ? <PacketSteps packet={packet} /> : <Empty>This turn has no Fact Packet.</Empty>}
    </div>
  );
}

/**
 * The office lookups the Brain made for this turn, one card each: the path it walked (every node a
 * link to its published data in Campus Graph), the order the model gave, how it ended, and the
 * whole call. This is the detail of the Pipeline tab's Lookup stage; with no lookups it is empty.
 */
export function LookupCards({ turn }: { turn: Turn }) {
  const calls = (brainTrace(turn.raw) ?? []).filter(isRecordValue);
  if (calls.length === 0) return null;
  return (
    <div className="mt-2.5 space-y-2">
      {calls.map((call, index) => (
        <ToolCallCard key={index} call={call} />
      ))}
    </div>
  );
}

/** The nodes one lookup walked, each a link to its published data in Campus Graph. */
function PathTrail({ call }: { call: Record<string, unknown> }) {
  const path = Array.isArray(call.path) ? call.path.filter(isRecordValue) : [];
  if (path.length === 0) return null;
  const args = isRecordValue(call.arguments) ? call.arguments : undefined;
  const fields = Array.isArray(args?.fields)
    ? args.fields.filter((field): field is string => typeof field === 'string') : undefined;
  return (
    <ol aria-label="Path walked" className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
      {path.map((node, nodeIndex) => (
        <li key={String(node.id)} className="flex min-w-0 items-center gap-2">
          {nodeIndex > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
          {typeof node.id === 'string' && typeof call.dataset_version === 'string'
            && typeof call.identity_hash === 'string' ? (
            <Link
              href={campusGraphHref(node.id, call.dataset_version, call.identity_hash,
                typeof call.as_of === 'string' ? call.as_of : undefined, fields)}
              prefetch={false}
              title="Open this node in Campus Graph"
              className="break-words rounded border border-sky-400/30 px-2 py-1 text-sky-400 hover:bg-sky-400/10 hover:underline"
            >
              {typeof node.label === 'string' ? node.label : node.id}
              <span className="sr-only"> — open in Campus Graph</span>
            </Link>
          ) : (
            <span className="break-words rounded border border-border px-2 py-1">
              {typeof node.label === 'string' ? node.label : String(node.id)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

type Tone = 'positive' | 'info' | 'attention' | 'neutral';

export const TONE: Record<Tone, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  attention: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  neutral: 'border-white/10 bg-white/[0.04] text-muted-foreground',
};

/* ----------------------------------------------------------- Tool calls */

function ToolCallCard({ call }: { call: Record<string, unknown> }) {
  const name =
    typeof call.tool === 'string' ? call.tool : typeof call.name === 'string' ? call.name : 'tool';
  const status = typeof call.status === 'string' ? call.status : undefined;
  const count = typeof call.result_count === 'number' ? call.result_count : undefined;
  const total = typeof call.total_matches === 'number' ? call.total_matches : undefined;
  const reason = typeof call.reason === 'string' ? call.reason : undefined;
  const args = argumentChips(isRecordValue(call.arguments) ? call.arguments : undefined);
  const ok = status === 'ok';

  return (
    <article className="rounded-xl border border-border bg-neutral-950/60 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-mono text-sm font-semibold text-foreground">{name}</span>
        {name === 'emergency_contacts' && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE.info}`}>
            looked up by the code, not the model
          </span>
        )}
        {status && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              ok ? TONE.positive : TONE.attention
            }`}
          >
            {status.replaceAll('_', ' ')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          {count !== undefined && (
            <span>
              {count}
              {total !== undefined && total > count ? ` of ${total}` : ''} result
              {count === 1 ? '' : 's'}
              {call.truncated === true ? ' · cut short' : ''}
            </span>
          )}
        </span>
      </div>

      <PathTrail call={call} />

      {args.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {args.map(([key, value]) => (
            <li
              key={key}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs"
            >
              <span className="text-muted-foreground">{key}</span>{' '}
              <span className="text-foreground">{value}</span>
            </li>
          ))}
        </ul>
      )}

      {typeof call.office === 'string' && !Array.isArray(call.path) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Matched <span className="text-foreground">{call.office}</span>
        </p>
      )}
      {Array.isArray(call.candidates) && call.candidates.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Could be <span className="text-foreground">{call.candidates.map(String).join(', ')}</span>
        </p>
      )}
      {reason && <p className="mt-2 text-xs text-amber-300">{reason.replaceAll('_', ' ')}</p>}

      <details className="mt-2.5">
        <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
          Full call
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-black/40 p-2.5 font-mono text-[11px] leading-5 text-muted-foreground">
          {JSON.stringify(call, null, 2)}
        </pre>
      </details>
    </article>
  );
}

function argumentChips(args: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!args) return [];
  const chips: Array<[string, string]> = [];
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value)) {
      if (value.length) chips.push([key, value.map(String).join(', ')]);
    } else if (typeof value === 'object') {
      for (const [inner, item] of Object.entries(value as Record<string, unknown>))
        add(inner, item);
    } else if (typeof value === 'boolean') {
      chips.push([key, value ? 'yes' : 'no']);
    } else {
      chips.push([key, String(value)]);
    }
  };
  for (const [key, value] of Object.entries(args)) add(key.replaceAll('_', ' '), value);
  return chips;
}

/* -------------------------------------------------------------- Helpers */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function formatMs(ms: number): string {
  return `${ms.toFixed(3)} ms`;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
