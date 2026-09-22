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

Source records never become traversal nodes. Scalar fields, arrays, and structured
properties render inline on their entity, preserving separate source values,
provenance, collection dates, validity, limitations, false, zero, and missing data.
More source properties can be loaded without changing the breadcrumb. Existing
low-level source APIs remain available for operational inspection.

The explorer owns one ordered traversal. Categories show their full entity list, and their filters stay in the
path, relationships carry their direction, revisits stay visible, and Back or an
ancestor click trims the same path. Search appends an explicit search step; it
never asserts a relationship. A deep link restores the selected entity under its
category. Traversal itself is session state, not a browser-history replay.

The desktop map and responsive relationship cards use the same directed edges.
Incoming connections keep their original direction and evidence. Unknown edge
labels have a generic fallback; new kinds do not need separate UI pages. Downloads
contain the complete loaded entity index, edges, evidence, and coverage issues.

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
