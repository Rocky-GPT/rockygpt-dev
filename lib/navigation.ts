/**
 * @module lib/navigation
 * What this app can show, and what it cannot show yet.
 *
 * Stated once and read three times: by the sidebar, by `/roadmap`, and by hand
 * when the README's gap list is written. The student UI's `DevPageMenu` kept a
 * hardcoded array inside a dropdown component, which meant the list of pages
 * and the reason a page existed lived in different places.
 *
 * `planned` items are rendered, not hidden. The shape of what is missing is
 * itself information — it is the difference between "this tool does not do
 * that" and "the brain does not expose that yet" — so every unbuilt item names
 * the endpoint it is waiting on, and `/roadmap` turns the set of them into the
 * working list for the next phase.
 */

import {
  Boxes,
  Database,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessageSquareCode,
  Radio,
  ScrollText,
  Settings2,
  Sparkles,
  Table2,
  Tags,
} from 'lucide-react';

export type ItemStatus = 'ready' | 'partial' | 'planned';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: ItemStatus;
  /** The upstream this reads. For `ready`, what it calls; otherwise what is missing. */
  upstream: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        href: '/',
        label: 'Dashboard',
        description: 'Clean-room Brain health and readiness at a glance',
        icon: LayoutDashboard,
        status: 'ready',
        upstream: 'GET /health + GET /readiness',
      },
      {
        href: '/roadmap',
        label: 'Roadmap',
        description: 'What is built, and what each gap is waiting on',
        icon: ListChecks,
        status: 'ready',
        upstream: 'this file',
      },
    ],
  },
  {
    id: 'brain',
    label: 'Brain',
    items: [
      {
        href: '/brain/ask',
        label: 'Ask & Inspect',
        description: 'Send a message through the clean-room chat shell',
        icon: MessageSquareCode,
        status: 'ready',
        upstream: 'POST /v1/chat',
      },
      {
        href: '/brain/capabilities',
        label: 'Capabilities',
        description: 'What the planner is shown it can look up',
        icon: Boxes,
        status: 'planned',
        upstream: 'clean-room capabilities contract',
      },
      {
        href: '/brain/trace-replay',
        label: 'Trace Replay',
        description: "Inspect a student's turn the way you inspect your own",
        icon: Sparkles,
        status: 'planned',
        // Five of the eight trace boxes are never written to the database, and
        // no route returns a stored trace or fetches one log by id. Re-asking
        // the question is not the same turn.
        upstream: 'no endpoint returns a stored brainTrace',
      },
      {
        href: '/brain/prompts',
        label: 'Prompts & Models',
        description: 'The instructions and models behind each stage',
        icon: Settings2,
        status: 'planned',
        upstream: 'nothing exposes prompt templates or model config',
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      {
        href: '/data/artifacts',
        label: 'Artifacts',
        description: 'Published campus datasets and their release metadata',
        icon: Database,
        status: 'planned',
        upstream: 'clean-room artifact contract',
      },
      {
        href: '/data/records',
        label: 'Records',
        description: 'What each capability returns when nothing narrows it',
        icon: Table2,
        status: 'planned',
        upstream: 'clean-room records contract',
      },
      {
        href: '/data/endpoints',
        label: 'Endpoints',
        description: 'The shaped campus routes, with a request builder',
        icon: Radio,
        status: 'planned',
        upstream: 'clean-room data endpoint contracts',
      },
      {
        href: '/data/releases',
        label: 'Releases',
        description: 'Dataset versions, publish history, ingestion runs',
        icon: Database,
        status: 'planned',
        // The rows are in Neon and the brain's role can read them; the SQL even
        // exists already in rockygpt-data's data-explorer server.
        upstream: 'no release-history endpoint on the brain',
      },
      {
        href: '/data/entities',
        label: 'Entities',
        description: 'What a question can resolve to, and what it cannot',
        icon: Tags,
        status: 'planned',
        upstream: 'no entity registry table or endpoint',
      },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    items: [
      {
        href: '/quality/logs',
        label: 'Chat Logs',
        description: 'Live student turns, routes, and latency',
        icon: ScrollText,
        status: 'planned',
        upstream: 'clean-room log and telemetry contracts',
      },
      {
        href: '/quality/feedback',
        label: 'Feedback',
        description: 'Ratings and comments, aggregated',
        icon: MessageSquareCode,
        status: 'planned',
        upstream: 'clean-room feedback contract',
      },
      {
        href: '/quality/evals',
        label: 'Eval Runs',
        description: 'Scored corpus runs, failures, and regressions',
        icon: FlaskConical,
        status: 'planned',
        upstream: 'rockygpt-evals has no HTTP surface and runs have no identity',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        href: '/operations/health',
        label: 'Service Health',
        description: 'Liveness, readiness, and reachability',
        icon: Gauge,
        status: 'ready',
        upstream: 'GET /health + GET /readiness',
      },
      {
        href: '/operations/config',
        label: 'Configuration',
        description: 'Models, timezone, flags, and the active dataset',
        icon: Settings2,
        status: 'planned',
        upstream: 'nothing exposes the brain Settings in effect',
      },
    ],
  },
];

/** Every item, flattened. Used by the roadmap table and for lookups. */
export const ALL_ITEMS: NavItem[] = NAVIGATION.flatMap((section) => section.items);

export function itemForPath(pathname: string): NavItem | undefined {
  return ALL_ITEMS.find((item) => item.href === pathname);
}

export function sectionForPath(pathname: string): NavSection | undefined {
  return NAVIGATION.find((section) => section.items.some((item) => item.href === pathname));
}
