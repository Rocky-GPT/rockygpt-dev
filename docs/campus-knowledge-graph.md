# Campus knowledge graph

`/data/entities` uses one entity-first explorer. Its model is entities, directed
relationships, and source-backed properties. The UI uses entity kinds only for
category labels; it has no event, club, faculty, or course-specific renderer.

The Brain's development-only `GET /v1/dev/graph/knowledge` returns the active
release's curated entities plus catalog courses and explicit directed edges.
`GET /v1/dev/graph/properties?entity_id=…&dataset_version=…` supplies properties
from exact linked source records. Property groups are paginated with `collection`,
`offset`, and `limit`. Neither endpoint uses a model or writes campus data.

Courses have deterministic UUIDs based on the published source key and catalog
record key. Their IDs survive artifact reordering. Duplicate source keys are
reported as ambiguous and do not produce a course identity or a guessed edge.
Profile-to-course relationships resolve only through exact published references.
They retain the label “lists course (undated)”; they do not establish `teaches`.

In the default legacy projection, source records never become traversal nodes. Scalar fields, arrays, and structured
properties appear as attached field nodes around their entity, preserving separate source values,
provenance, collection dates, validity, limitations, false, zero, and missing data.
Leaf nodes are green and non-clickable; their complete values and source details
remain readable inside the node, with scrolling for long text. Nodes with children
are blue. Non-empty structured fields open their contents and provenance in an
accessible dialog; related entities continue graph traversal. Empty lists/objects
and scalar values (including false, zero, and null) are leaves. Multiple scalar
source values alone do not create children.
There is no separate Properties panel or duplicate relationship card list. More
source properties can be loaded from an attached node without changing the breadcrumb. Existing
low-level source APIs remain available for operational inspection.

The explorer owns one ordered traversal. Categories show their full entity list, and their filters stay in the
path, relationships carry their direction, revisits stay visible, and Back or an
ancestor click trims the same path. Search appends an explicit search step; it
never asserts a relationship. A deep link restores the selected entity under its
category. Traversal itself is session state, not a browser-history replay.

The scrollable graph canvas works at every viewport width and uses native
keyboard-accessible buttons for field and relationship nodes. All loaded fields
and relationships remain attached, including for entities without relationship edges.
Incoming connections keep their original direction and evidence. Unknown edge
labels have a generic fallback; new kinds do not need separate UI pages. Downloads
request the complete authoritative published graph, identity bindings, evidence and
coverage from the Brain; see [the export contract](campus-graph-export.md).

## Coverage and limits

The current published registry contains people, offices, facilities, dining venues,
programs, clubs, and event occurrences; catalog courses complete those eight kinds.
The current release publishes `convener`, `organized_by`, and `profile_course`
relationships. The UI has labels for other relationship kinds, but `advisor`,
`teaches`, `requires`, `part_of`, and `located_at` still require explicit published
relationships and corresponding ingestion/registry support. Names inside source
properties do not create identity links. The explorer exposes disconnected entities
and unresolved references rather than implying a completely connected dataset.

An index or property request is bound to the active dataset and identity hash.
Release changes require a reload; missing sources and ambiguous references remain
visible as coverage issues.

Validation: `npm run typecheck`, `npm run lint`, `npm run test:graph`,
`npm run test:identities`; Brain tests in `tests/test_knowledge_graph.py` and the
existing graph/identity API suites. Browser checks cover entity/course navigation,
reverse relationships, properties, category restoration, and the single breadcrumb.

## Stage 2: opt-in projection explorer

Open `/data/entities?projection=v1` to use the versioned projection in this visit.
An `entity` query parameter can be combined with the flag. The server setting
`DEV_GRAPH_PROJECTION_V1=true` enables it for the Dev Explorer; its default is off.
`?projection=legacy` explicitly restores the old path. No student-facing UI,
Brain query behavior, source mappings, or database schemas change in this stage.

`lib/graph-projection.ts` validates and consumes the v1 contract. The generic
`ProjectionGraph` canvas handles three attachment types:

- Direct properties retain every assertion and its provenance; conflicting
  scalar assertions remain separate values in one non-clickable leaf.
- Contextual groups contain individual record nodes identified by published IDs,
  never by names. Each record owns its context fields, properties and explicit
  relationships. Repeated dish names and seasonal schedules stay separate.
- Records sit under the sections the Brain sends: hours under their validity
  period, menus under date, meal and station. Section cards open their records,
  ended sections fold away below the rest, and a search looks through every record
  below the current level. Hours records are titled by weekday, with the schedule
  under the title.
- Explicit relationships resolve canonical IDs against the knowledge index,
  preserving direction, predicate, exact evidence and registry locator. Plain
  property values never create links. Unresolved IDs are not guessed.

Groups, sections, records and structured property children extend the Explorer's
existing breadcrumb. There is no second path or bottom Properties panel. Green leaves
remain non-clickable and scrollable, with complete value and source text; blue
nodes navigate to their children or a canonical entity. Source limitations,
publication status, collection time, freshness, validity, original row ID and
field path stay attached to each assertion. Relationship evidence has a separate
accessible dialog. Search is labelled as search, not a factual edge. Back and
ancestor clicks retain the original journey even across projection/legacy views.
Deep links restore the owning entity; attachment traversal remains session state.

Record groups load sequentially in pages of 100 and append automatically into one
continuous list, with progress counts and no Previous/Next controls. Requests bind
the dataset, identity hash, entity, group, filters and page size; merging also
checks mapping version, ordering, total and duplicate IDs. A continuation cannot
replace direct properties or entity relationships. Repeated cursors stop loading.
Unmounting an entity aborts pending requests; stale responses cannot update a
different entity. A request times out rather than waiting indefinitely.

Fallback is deliberately explicit:

- Any `collection_not_migrated` coverage issue uses the unchanged `EntityGraph`
  for the entire entity. This preserves existing course, faculty, club, event and
  program data without merging incompatible projection semantics.
- Dining can have incomplete contact fields while its contextual records are
  mapped. Show projected content with coverage details and a link to the existing
  projection; do not silently imply completeness or expose omitted storage fields.
- An unavailable endpoint or unsupported initial response uses the existing view.
- A page failure retains already loaded records, an explicit partial-state error,
  and a retry action. A release/identity/mapping mismatch requires a graph reload
  and never silently falls back across snapshots.

The flag can be disabled without rollback or data migration. The graph
download uses the authoritative server export, independently of attachment pages.

Validation adds `tests/graph-projection.test.mjs` to `npm run test:graph`:
record boundaries, provenance, scalar/structured leaves, conflicts, directional
and record-subject relationships, breadcrumb traversal, continuation scope,
malformed contracts, missing records, fallback and request cancellation.
A synthetic requirement-group fixture checks generic renderer support; actual
program requirement publication and cross-domain proof remain Stage 3.

Stage-two verification: 38 graph tests and 19 identity tests pass, along with
typecheck, lint and the production build. Live browser checks on the published
local release loaded all 887 Birch offerings and 21 hours records; checked
separate same-name offerings, schedule validity, nested allergen provenance,
non-clickable green leaves, ancestor navigation, Sports Club/event fallback and
relationship traversal, and Back restoration of the original hours record.
Flag-off behavior continues to render only the legacy graph.
