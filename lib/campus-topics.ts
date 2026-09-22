import type { IdentityKind } from './identities';

export interface TopicSource { id: string; label: string }
export interface TopicSources {
  collections: TopicSource[];
  artifacts: TopicSource[];
}
export interface CampusDataTopic {
  id: string;
  label: string;
  description: string;
  collection: string;
  sources: TopicSources;
}

// These are navigation routes over published data, not identity relationships.
// Category source collections remain unscoped so records without identity links
// are reachable. An individual identity still uses its exact published links.
export const IDENTITY_TOPIC_SOURCES: Record<IdentityKind, TopicSources> = {
  person: {
    collections: [
      { id: 'faculty', label: 'Faculty profiles' },
      { id: 'contacts', label: 'Contact records' },
    ],
    artifacts: [{ id: 'faculty', label: 'Original faculty source' }],
  },
  office: {
    collections: [
      { id: 'contacts', label: 'Contact records' },
      { id: 'campus_hours', label: 'Operating hours' },
    ],
    artifacts: [{ id: 'hours', label: 'Original operating hours source' }],
  },
  facility: {
    collections: [{ id: 'campus_hours', label: 'Operating hours' }],
    artifacts: [{ id: 'hours', label: 'Original operating hours source' }],
  },
  venue: {
    collections: [
      { id: 'dining_hours', label: 'Dining schedules' },
      { id: 'menu', label: 'Menu offerings' },
      { id: 'contacts', label: 'Contact records' },
    ],
    artifacts: [
      { id: 'dining-hours', label: 'Original dining schedules' },
      { id: 'dining-hours-context', label: 'Dining schedule context' },
      { id: 'menu', label: 'Original menu source' },
      { id: 'menu-context', label: 'Menu context' },
      { id: 'menu-week', label: 'Stored menu dates' },
    ],
  },
  program: {
    collections: [
      { id: 'programs', label: 'Academic programs' },
      { id: 'program_requirements', label: 'Program requirements' },
    ],
    artifacts: [
      { id: 'programs', label: 'Original programs source' },
      { id: 'catalog-conveners', label: 'Catalog convener source' },
    ],
  },
  club: {
    collections: [{ id: 'clubs', label: 'Organizations directory' }],
    artifacts: [{ id: 'clubs', label: 'Original organizations source' }],
  },
  event: {
    collections: [{ id: 'events', label: 'Event occurrences' }],
    artifacts: [
      { id: 'events', label: 'Original events source' },
      { id: 'event-organizers', label: 'Event organizer source' },
    ],
  },
};

export const CAMPUS_DATA_TOPICS: CampusDataTopic[] = [
  {
    id: 'transportation', label: 'Transportation', description: 'Shuttle routes and trips',
    collection: 'shuttle_routes',
    sources: {
      collections: [
        { id: 'shuttle_routes', label: 'Shuttle routes' },
        { id: 'shuttle', label: 'Shuttle trips' },
      ],
      artifacts: [{ id: 'transportation', label: 'Original transportation source' }],
    },
  },
  {
    id: 'calendar', label: 'Calendar', description: 'Academic dates and sessions',
    collection: 'calendar',
    sources: {
      collections: [{ id: 'calendar', label: 'Academic calendar' }],
      artifacts: [{ id: 'calendar', label: 'Original calendar source' }],
    },
  },
  {
    id: 'courses', label: 'Courses', description: 'Catalog course records',
    collection: 'courses',
    sources: {
      collections: [{ id: 'courses', label: 'Catalog courses' }],
      artifacts: [{ id: 'courses', label: 'Original courses source' }],
    },
  },
  {
    id: 'documents', label: 'Documents', description: 'Campus documents and passages',
    collection: 'documents',
    sources: {
      collections: [
        { id: 'documents', label: 'Documents' },
        { id: 'document_chunks', label: 'Document passages' },
      ],
      artifacts: [],
    },
  },
  {
    id: 'campus-facts', label: 'Campus facts', description: 'Stored campus facts',
    collection: 'critical_facts',
    sources: {
      collections: [{ id: 'critical_facts', label: 'Campus facts' }],
      artifacts: [],
    },
  },
];

// Release-wide identity metadata belongs to the campus root's View source
// disclosure. Domain source artifacts are reached through their own topics.
export const CAMPUS_GRAPH_SOURCES: TopicSources = {
  collections: [],
  artifacts: [
    { id: 'campus-identities', label: 'Published identity map' },
    { id: 'campus-identity-coverage', label: 'Identity coverage and unresolved links' },
  ],
};
