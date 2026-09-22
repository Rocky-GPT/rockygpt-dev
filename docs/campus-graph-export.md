# Published campus knowledge graph download

**Download graph** on `/data/entities` requests a new, complete server export from
`GET /api/brain/graph/export`, which proxies the development-only Brain endpoint
`GET /v1/dev/graph/export`. The button does not serialize the Explorer's index,
projection attachments, current search, selected entity, or loaded pages. Both
legacy and opt-in projection views use the same download.

The Brain builds the file directly from `KnowledgeGraph`, its validated identity
registry, and the entire canonical catalog projection, inside one repeatable-read,
read-only database transaction. It rechecks that the selected release is active.
No paginated API, model, name-based identity matching, reverse-edge synthesis, or
source-data writes are involved. Required unreadable graph inputs fail the export;
the UI displays an error instead of saving a successful-looking partial file.

The file is named `campus-knowledge-graph.json`, with schema
`rockygpt.published-campus-knowledge-graph`, version 1. Its contents are:

| Field | Contents |
| --- | --- |
| `snapshot` | Dataset ID/version, activation and publication metadata, source commit, full quality summary, campus date/timezone, identity hash, artifact manifest and graph-input payload hashes |
| `nodes` | Every canonical registry entity and unambiguous source-scoped catalog course, including aliases, exact source bindings and artifact locators |
| `edges` | Every resolved explicit directed relationship occurrence, original evidence references, and registry artifact locator |
| `published_relationships` | Every original relationship declaration, including repeats and unresolved targets, with its source node and resolution result |
| `unresolved_relationships` | Full unresolved declarations, original target selectors, evidence and available exact catalog candidates |
| `identity_registry` | The full original published registry, preserving optional fields and source binding arrays |
| `coverage` | The full original published coverage report, without field stripping or issue limits |
| `diagnostics` | All canonical graph resolution and coverage diagnostics; absent/invalid reports are explicit |
| `source_catalog` | Source URLs, titles, trust tiers, freshness policy and published run provenance used by the graph layer |
| `counts` | Nodes by kind, resolved relationships by type, declarations by type, bindings, evidence references and diagnostic totals |
| `completeness`, `semantics` | Exact export scope, identifier and binding rules, timestamp/hash meaning and interpretation limits |

Source-key and source-record-ID arrays are independent matching constraints, not
pairs to zip. Published relationship evidence references remain unchanged, including
pinned row IDs. Artifact locators carry exact paths and hashes. Repeated directed
relationships remain separate occurrences, identified by their owner and published
array index. An unresolved declaration is retained without creating a guessed
canonical node or an edge to a nonexistent node. Faculty `profile_course` edges
remain undated profile listings, not current teaching assignments.

This is a self-contained **graph and resolution snapshot**, not a dump of every
source record's properties. Evidence references and provenance are embedded in
full; unrelated source bodies, documents, menu offerings and hours records are not.
The current graph schema has only canonical entity endpoints (including catalog
courses), so no contextual records need embedding. A future relationship schema
that targets contextual records must extend the export accordingly. No navigation
categories or UI-only edges are added.

Missing coverage is `null`, never a claim of zero issues. The exported coverage
report is published diagnostic data, not a new relationship discovery or source
cleanup audit. `exported_at` is generation time; original source dates remain
separate. Stored artifact content hashes and canonical JSON payload hashes have
separate names and documented algorithms.

Verification includes complete export/index parity, catalogs beyond UI page
limits, coverage reports beyond 1,000 issues, independent binding arrays, repeated
edges, unresolved target evidence, missing inputs, release switches, development
gating and no model calls. The opt-in Brain test reads the local published dataset
with `GRAPH_TEST_DATABASE_URL` and compares every node and edge with the authoritative
graph. Existing Explorer rendering/navigation is unchanged.

The older `lib/campus-graph-export.ts` utility is a historical source-navigation
export and is not used by this button or endpoint.
