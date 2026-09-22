# Campus Graph source navigation — development checkpoint

Verified September 21, 2026. Campus Graph now expands original records and their
fields instead of ending at source-group nodes. Ramapo → All source records stays
inside the graph and includes records without approved identity links.

## Behavior

- Identity source groups resolve exact published links; catalog-course nodes resolve
  exact source references. They do not use fresh name matching.
- Menus expand by stored date → meal → station → original item → fields → values.
  All seven stored menu dates are available, independently of the profile preview's
  selected date and result limit.
- Every collection exposes original records, nested objects/arrays, and complete
  scalar values. Leaf nodes display complete values in place and do not expand or
  act as buttons, including empty containers. Long text can be scrolled with the
  keyboard. Only nodes with children expand. Eight visible nodes per page keep the graph readable; Next,
  Previous, Back, and breadcrumbs retain access to all pages.
- Documents expose their ordered passages. Shuttle routes expose their trips through
  original foreign keys. Raw release artifacts expose paginated JSON subtrees.
- Original IDs, source keys/URLs, collection timestamps, artifact hashes and exact
  paths remain visible. Artifact creation and source capture are not verification.
- Unknown, false, zero, empty text and empty containers remain distinct. Stored
  conflicts remain separate records. Faculty course lists remain undated.
- Browsing and field nesting do not create identities or approve relationships.
  The 1,053 existing unresolved issues remain unchanged: 626 courses, 315 events,
  67 clubs, 45 programs. This is an issue count, not unique missing records.
- Requests pin the active dataset and check the identity hash; release changes,
  broken links, ambiguous references, and unavailable projections are explicit.
  Search can jump out of a nested record, including reselecting the same identity.

## Active local development

- Brain commit: `be7baedf2807e21f16ea24bdc4356a9455d2ef99`, pushed to `dev`.
- Brain configuration hash:
  `0d06740588816ab74b48736817df90748625e659709056b07a0956fbd5063a9e`.
- Dataset: `dev-profiles-clubs-events-20260921` (unchanged; no new publication needed).
- Identity hash:
  `d89a6a6f70a8fcbc340028654b40d43e34b3cf17dfd887a4e98ce8f0218ad53c`.
- Brain runs from its immutable Git archive on port 8000 against the isolated local
  database, using `brain_campus_reader`. Dev UI on port 3100 uses the API through its
  normal server proxy. Running readiness and graph responses confirm the hashes above.
- No production deployment, database/schema writes, identity changes or model calls.
  Student UI and the existing retrieval/tool flow are unchanged.

## Coverage

The catalogue contains 17 collections. Counts overlap where an original artifact
also has structured projections; they are not 9,906 distinct campus facts.

| Collection | Records |
| --- | ---: |
| Documents | 14 |
| Campus facts | 14 |
| Contacts | 245 |
| Operating hours | 77 |
| Dining schedules | 70 |
| Menu offerings | 887 |
| Academic calendar | 144 |
| Events | 316 |
| Organizations directory | 254 |
| Programs | 146 |
| Program requirements | 1,007 |
| Catalog courses | 3,344 |
| Faculty profiles | 226 |
| Shuttle trips | 51 |
| Document passages | 3,090 |
| Shuttle routes | 4 |
| Original release artifacts | 17 |

## Verification actually performed

- Brain full pytest: **577 passed, 37 skipped**. Focused graph suite including the
  actual read-only local database: **56 passed**. Traversed all pages of all 17
  collections, matched totals and unique original IDs, and loaded record detail
  in every collection. New modules pass Ruff and mypy.
- Dev UI: **30 helper tests passed**, ESLint, TypeScript, and production build.
  The build used a temporary source copy with the committed Next configuration;
  unrelated local `next.config.ts` changes were preserved. After a disk-full retry,
  the final build passed with the temporary Webpack disk cache disabled. Temporary
  build removed; no application data was deleted.
- Tests cover release mismatches, production 404, input validation, ambiguous and
  missing links, exact references, pagination, duplicate labels, full/deep JSON
  traversal, null/false/zero/empty distinctions, and malformed artifact projections.
- Active HTTP through port 3100: all 17 collections available; readiness `ready`,
  matching dataset/hash; stale release returns 409; exact Alfredo Sauce record 200.
- Browser traces on the running app:
  - Birch → Menu offerings → 2026-09-21 → Lunch → second station page → Twists →
    Alfredo Sauce → fields → allergens → `[1]` → `Milk`. Back/breadcrumb restored
    Lunch's second page (9–9 of 9). All seven menu dates were visible.
  - Ramapo → All source records → Documents → campus-hours → original document →
    Document passages, ordered Passage 1 through 8 with remaining-page navigation.
  - All source data → Shuttle routes → weekday → Ramsey Route 17 → Shuttle trips.
  - All source data → third collection page → Published source artifacts → second
    artifact page → programs → schools → `[0]` → majors/school/shortName, with exact
    artifact path/hash/creation-time meaning displayed.
  - Search Scott Frees → Faculty profiles → school → original faculty record →
    fields → all seven courses; the undated-course notice remains visible.
  - Search Bonnie Blake → COMM 219 → exact original catalog record and fields.
  - Narrow viewport: button-list fallback, no horizontal document overflow,
    Enter opens a scalar course value. Temporary viewport override reset.
- Local receipts: `.local-logs/profile-feature/full-graph-api.json`,
  `graph-active-http.json`, and `active-brain.json` in the root workspace.

### Non-clickable leaf follow-up

Browser verification after the follow-up: Marinara Sauce's eight visible scalar
and empty-array/null fields contain **zero buttons**; clicking `calories` leaves
the path unchanged. In the original `programs` artifact, all five scalar values
are visible and inert; only the `schools` array is expandable. Leaf text remains
complete, selectable, and scrollable. The older click-through traces above record
the initial checkpoint; terminal values now appear directly in their parent graph.

## Rollback

For a leaf-only rollback, revert the Dev UI leaf-display follow-up and restore
Brain `2a0d4d9da6c8c51ac1a3d1769f5cdb52984f78f1` using the deployment tool
below with that revision. For a complete source-navigation rollback, revert the
Dev UI graph commits in reverse order on `dev` and push normally; the prior UI
checkpoint was `68b3139ed1f17c6b1f6a3999d3f3ba5437b270ac`.
Keep unrelated `next.config.ts` work untouched. Restore the UI first so it no longer
requests graph endpoints, then restore the prior Brain using the established tool:

```sh
cd rockygpt-infra
../rockygpt-brain/.venv/bin/python scripts/deploy-profile-brain-dev.py \
  --revision 85bd83938c9f51bb4c55d4f63fb207ac871d3422 \
  --database postgresql://brain_campus_reader@127.0.0.1:55434/rockygpt_profiles_dev_clubs_events_20260921 \
  --expected-dataset dev-profiles-clubs-events-20260921
```

No data rollback is required. Do not point this workflow at the shared production
database, force-push, or switch branches.
