'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface MapGroup {
  key: string;
  label: string;
  color: string;
  nodes: Array<{ id: string; label: string; href: string }>;
  missing: number;
}

const W = 312;
const H = 262;

/**
 * This node in the middle and one bubble per kind of link around it. A dashed "?" bubble is a link
 * the graph does not have yet. Clicking a bubble lists the nodes behind it, each opening its card.
 */
export function ConnectionsMap({ center, color, groups, gaps }: {
  center: string;
  color: string;
  groups: MapGroup[];
  gaps: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const bubbles = [
    ...groups.map(group => ({ ...group, count: group.nodes.length + group.missing, gap: false })),
    ...gaps.map(label => ({ key: `gap:${label}`, label, color: '#a68a33', nodes: [], missing: 0, count: 0, gap: true })),
  ];
  const cx = W / 2;
  const cy = H / 2 + 4;
  const radius = bubbles.length > 6 ? 100 : 92;
  const placed = bubbles.map((bubble, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(bubbles.length, 1);
    const size = bubble.gap ? 17 : Math.min(15 + Math.sqrt(bubble.count) * 4.2, 30);
    return { ...bubble, x: cx + radius * Math.cos(angle) * 1.18, y: cy + radius * Math.sin(angle), size };
  });
  const chosen = placed.find(bubble => bubble.key === open);
  const total = groups.reduce((sum, group) => sum + group.nodes.length + group.missing, 0);
  const short = center.length > 12 ? `${center.slice(0, 11)}…` : center;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
        aria-label={`${center}: ${total} links in ${groups.length} groups${gaps.length ? `, ${gaps.length} not in the graph yet` : ''}`}>
        {placed.map(bubble => (
          <line key={`l-${bubble.key}`} x1={cx} y1={cy} x2={bubble.x} y2={bubble.y}
            stroke={bubble.gap ? '#7c6a2e' : bubble.color} strokeOpacity={bubble.gap ? 0.9 : open && open !== bubble.key ? 0.15 : 0.5}
            strokeWidth={bubble.gap ? 1.3 : Math.min(1.4 + bubble.count * 0.25, 5)} strokeDasharray={bubble.gap ? '4 4' : undefined} />
        ))}
        {placed.map(bubble => {
          const above = bubble.y < cy - 40;
          const body = (
            <>
              <circle cx={bubble.x} cy={bubble.y} r={bubble.size} fill={bubble.gap ? '#1f1c12' : open === bubble.key ? bubble.color : '#222'}
                fillOpacity={open === bubble.key ? 0.3 : 1} stroke={bubble.gap ? '#a68a33' : bubble.color} strokeWidth={open === bubble.key ? 3 : 2}
                strokeDasharray={bubble.gap ? '4 3' : undefined} />
              <text x={bubble.x} y={bubble.y + 5} textAnchor="middle" fontSize={bubble.gap ? 13 : 14} fontWeight={700}
                fill={bubble.gap ? '#d6b25a' : '#fff'}>{bubble.gap ? '?' : bubble.count}</text>
              <text x={bubble.x} y={above ? bubble.y - bubble.size - 6 : bubble.y + bubble.size + 13} textAnchor="middle"
                fontSize={10.5} fill={bubble.gap ? '#c9a54b' : '#b4b4bc'}>{bubble.label}</text>
            </>
          );
          if (bubble.gap) return <g key={bubble.key}><title>{`${bubble.label}: not in the graph yet`}</title>{body}</g>;
          return (
            <g key={bubble.key} role="button" tabIndex={0} className="cursor-pointer outline-none"
              aria-pressed={open === bubble.key} aria-label={`${bubble.label}: ${bubble.count}`}
              onClick={() => setOpen(open === bubble.key ? null : bubble.key)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setOpen(open === bubble.key ? null : bubble.key);
                }
              }}>
              {body}
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={31} fill="#1f1f1f" />
        <circle cx={cx} cy={cy} r={30} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2.5} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">{short}</text>
      </svg>
      {chosen ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-semibold text-zinc-400">{chosen.label} ({chosen.count})</p>
          <ul className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
            {chosen.nodes.map(node => (
              <li key={node.id}>
                <Link href={node.href} prefetch={false}
                  className="block rounded-full border border-[#383838] bg-[#262626] px-2.5 py-1 text-xs text-zinc-100 hover:border-sky-500/60">
                  {node.label}
                </Link>
              </li>
            ))}
            {chosen.missing > 0 && (
              <li className="rounded-full border border-dashed border-amber-500/50 px-2.5 py-1 text-xs text-amber-300">
                {chosen.missing} with no node yet
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-zinc-500">
          {groups.length ? 'Click a bubble to list those links.' : 'No links yet.'}
          {gaps.length ? ' Dashed bubbles are links the graph does not have yet.' : ''}
        </p>
      )}
    </div>
  );
}
