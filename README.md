# rockygpt-dev

The RockyGPT developer control room is a sibling product to `rockygpt-ui`, not a mode of it. It talks
to the Brain only over HTTP and shows what the Brain is, what it published, and what it did on a
turn.

## What is connected

The current Brain is a bounded assistant: one model with two tools, `office_facts` and `finish`, and
code that writes every answer text. It serves `GET /health`, `GET /readiness`, `POST /v1/chat` and
`GET /v1/entities/{id}/facts`. A Brain running in development also serves `GET /v1/dev/runtime`,
`GET /v1/dev/offices` and `GET /v1/dev/offices/search`, but only to a request that sends
`x-rockygpt-diagnostics: 1`, which this app does.

| Page | Shows | Reads |
|---|---|---|
| Dashboard, Service Health | Liveness, readiness, the routes the Brain serves | `/health`, `/readiness`, `/openapi.json` |
| Ask & Inspect | Answer, sources, the lookups the model made, who decided, the exact request and response; a bulk runner | `POST /v1/chat` |
| Capabilities | The tools and answer parts the model is given | `/v1/dev/runtime` |
| Prompts & Models | The system prompt, the model and its prices, what the model receives each turn | `/v1/dev/runtime` |
| Templates | Every text the code writes itself, and when | `/v1/dev/runtime` |
| Offices | The published offices and the facts the shared reader returns for each | `/v1/dev/offices`, `/v1/entities/{id}/facts` |
| Release | The dataset version, identity hash and counts | `/v1/dev/offices` |
| Aliases | Every alias, and what a name would find | `/v1/dev/offices`, `/v1/dev/offices/search` |
| Configuration | The limits and model the Brain runs with | `/v1/dev/runtime` |
| Storage | Partial: the production Brain's numbers load; this Brain has no storage route | `/v1/storage` |

Documents, Campus Graph, Chat Logs, Feedback and Eval Runs are switched off: they were built for an
older Brain and read routes this one does not serve, so each shows a "switched off" card. Their code
is kept. Artifacts, Endpoints and Trace Replay do not exist yet. The Roadmap page lists all of this
from `lib/navigation.ts`.

## Ask & Inspect

It sends the conversation as `{ "messages": [...], "omittedMessages": n }`: the most recent part of
the history, with a count of older messages left out. The Brain returns JSON with an answer, a status
(`answered`, `partial`, `clarification` or `unavailable`), trusted citations, a request ID and the
dataset version. Because this app sends `x-rockygpt-diagnostics: 1`, a development Brain also returns
a `trace` (each office lookup the model made) and `metrics` (who decided, model calls, model spend,
offices shown, how the model finished). The Trace tab says "This Brain sent no trace" when a Brain
sends neither.

Answer-quality evaluation lives in the sibling `rockygpt-evals` repository.

## Campus Graph (switched off)

> Switched off: the current Brain serves no `/v1/dev/graph` or `/v1/dev/identities` routes, so
> `/data/entities` shows the "switched off" card. The code and docs below are kept for when it does.

Open **Data → Campus Graph** (`/data/entities`) to inspect the active
identity release. Start at Ramapo College, browse a category, or search names,
aliases or persistent IDs to jump directly to an identity. Category navigation
uses gray dotted edges; it does not assert an organizational or location fact.
Identity relationships use teal dashed edges and original records use solid sky
edges. Selecting identities expands their immediate connections while retaining
the visited neighborhood. Focus, collapse, clear, or return to Ramapo College to
reduce the view. The graph shows at most eight identities and twelve record
groups, reports omitted counts, and pages category results eight at a time.
All source records, including data without identities, remain accessible from
the graph. Edge inspectors expose exact evidence references and safe source
links; source capture timestamps are shown when available in the loaded profile.
Click a source group to inspect its section. The original connection list remains
available below the graph.
Selections are addressable with `?entity=<persistent-id>`.

The evidence inspector preserves source IDs, timestamps and conflicting values.
Missing sections remain unknown. Faculty course lists are undated; operating
hours do not establish staff or phone availability. Apply a campus date and meal
to inspect dining evidence; menus show a labelled sample of up to 12 records.
The Unresolved view explains links that still need evidence. Both the identity
and the exact assembled profile can be downloaded as JSON.

The data coverage issues panel groups the release's coverage report by each
issue's `kind` from the Data identity compiler: records no entity links to,
missing connections, reviewed entries with no data in the release, and notes.
For releases compiled before kinds existed, it matches each reason to a template
the compiler writes. A kind or reason the panel does not recognize stays visible
under Other.

Clubs and event occurrences appear alongside people, offices, facilities, dining
venues and academic programs. Events and club-linked occurrences retain their
published dates; optional event-date filters do not default to today or inherit
a dining meal selection. Explicit organizer links can be followed in either direction.
An organizer or location mentioned only by name remains source information, not
an inferred identity relationship. Administrative entries in a club directory
are not automatically treated as student clubs.

This read-only view uses `GET /v1/dev/identities` and
`GET /v1/dev/identities/{id}` through the server-side Brain proxy. The Brain only
exposes these routes when `BRAIN_ENVIRONMENT=development`. It uses the existing
identity artifact and profile lookup without model calls or a second database.
Release/hash checks prevent mixing an identity map with a different profile
release. The Student UI is unchanged.

Verify changes with `npm run test:identities`, `npm run typecheck`,
`npm run lint`, and `npm run build`.

## Feedback sorting (switched off)

> Switched off: the current Brain serves no `/v1/feedback` route, so `/quality/feedback` shows the
> "switched off" card and nothing reaches Jev. `TYPESAFE_API_KEY` has no use until it returns.

**Quality → Feedback** (`/quality/feedback`) can sort the recent ratings with
Jev, TypeSafe's classifier. Press **Sort with Jev** and each rating gets a topic
(dining, hours, shuttle and parking, courses, and so on). A thumbs down gets a
reason too when the student gave none or chose "Other": inaccurate, incomplete,
outdated or could be better, the same labels the student UI offers. The
**What students are unhappy about** panel counts thumbs down by topic and
reason; click a row to filter the list. It counts student ratings only, not the
reviews you give on Chat Logs.

Each rating is one Jev call of about $0.0001, and one press sorts at most 100.
Jev reads the rated question, answer and comment and only picks labels. The tags
are saved in `.data/feedback-tags.json` on this machine (git-ignored). The file
holds feedback IDs, labels and Jev's confidence, never a question, answer or
comment, and nothing is written back to the Brain's database. A rating whose
reason or comment changes later is sorted again. Set `TYPESAFE_API_KEY` to turn
the button on; verify changes with `npm run test:feedback`.

## Conversation export

**Ask & Inspect**'s download button saves the conversation as compact JSON for
debugging later, often by an AI reading only the file. The conversation's
`messages` are written once, and each turn's `request.messages` are indexes into
`messages`. A request that left earlier messages out says so in `sentWith` and
`request.omittedMessages`.

Each turn has `sentAt` and `finishedAt`, `timing` (when the answer text the student
would read arrived and whether it was the answer or a failure's emergency help, and
the total), `brain.datasetVersion`, and the Brain's `response` exactly as sent. Because
this app asks a development Brain for diagnostics, the response carries its `trace` (each
office lookup the model made) and `metrics` (who decided, model calls, spend, offices
shown, how the model finished). Any `diagnostics.evidence` a Brain sends is listed once in
`evidence`, keyed by ID, with later different versions of a record in `evidenceVersions`;
`exportedEvidence()` in `lib/turn-export.ts` reads them back. Verify changes with
`npm run test:export`.

## Running

```bash
npm install
cp .env.example .env
npm run dev
```

The Dev UI runs at `http://localhost:3100`. The Brain defaults to
`http://127.0.0.1:8000` during local development.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `BRAIN_URL` | in production | Brain service address; local development falls back to `http://127.0.0.1:8000`. |
| `STAGING_SERVICE_TOKEN` | for a protected Brain | Shared server-side environment token; must match the Brain. |
| `PRODUCTION_BRAIN_URL` | no | The production Brain the Storage page reads; defaults to the public service. |
| `TYPESAFE_API_KEY` | no | Used only by the switched-off Feedback page; no current use. |

The Dev UI does not connect to a database or import another repository's source. It calls only the
Brain.
