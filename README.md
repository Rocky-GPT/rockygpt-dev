# rockygpt-dev

The RockyGPT developer control room is a sibling product to `rockygpt-ui`, not a mode of it. It talks
to the Brain only over HTTP and shows what the Brain is, what it published, and what it did on a
turn.

## What is connected

The current Brain is a bounded assistant: one model with two tools, `graph_lookup` and `finish`, and
code that writes every answer text. It serves `GET /health`, `GET /readiness`, `POST /v1/chat` and
`GET /v1/entities/{id}/facts`. A Brain running in development also serves `GET /v1/dev/runtime`,
`GET /v1/dev/offices` and `GET /v1/dev/offices/search`, but only to a request that sends
`x-rockygpt-diagnostics: 1`, which this app does.

| Page | Shows | Reads |
|---|---|---|
| Dashboard | Liveness, readiness, a count of the public routes | `/health`, `/readiness`, `/openapi.json` |
| Service Health | Liveness and readiness, with a fixed list of the Brain's routes | `/health`, `/readiness` |
| Ask & Inspect | Answer, sources, the lookups the model made, who decided, the exact request and response; a bulk runner | `POST /v1/chat` |
| Laptop vs Production | One question, or a pasted or uploaded list, asked of the laptop Brain and the production Brain side by side, with status, time, sources and an agree/differ marker; a switch adds the laptop and live websites. Production gets at most 2 asks at once; its token comes from 1Password via `local-env.py` | `POST /v1/chat` on both Brains, `POST /api/chat` on both sites |
| Repeat Test | Every question of a set (from the laptop's rockygpt-evals folder, frozen sets locked) or a pasted list, asked 5 to 10 times at once, live: each try's box fills as it answers, same letter = same answer, and each question is marked Steady, a little off, or Flaky (40% or more of tries differ). Code compares status and facts, not wording, links or the clock time an answer mentions, so checking is free. Shows the cost before it starts and the real spend as it runs | `POST /v1/chat`, 8 at once on the laptop Brain, 2 on production |
| Answer Cards | Partial: one card per how-to task, joined by rules in the graph build from every office page that lists it. A tile shows the card's status (Ready, Needs a look, Date passed), its owner office and why; a card opens to the winning page's steps beside the page's own words, the pages used, the pages left out with the reason, and other offices' pages that mention it. Search, an office filter, status filters, and a switch to every task page by page. A release built without cards shows the tasks only. Nothing answers from a card yet | `/v1/dev/answer-cards`, `/v1/dev/answer-cards/task` |
| Capabilities | The tools and answer parts the model is given | `/v1/dev/runtime` |
| Prompts & Models | The system prompt, the model and its prices, what the model receives each turn | `/v1/dev/runtime` |
| Templates | Every text the code writes itself, and when | `/v1/dev/runtime` |
| Offices | The published offices and the facts the shared reader returns for each | `/v1/dev/offices`, `/v1/entities/{id}/facts` |
| Release | The dataset version, identity hash, and counts of offices and alias entries | `/v1/dev/offices` |
| Aliases | Every alias, and what a name would find | `/v1/dev/offices`, `/v1/dev/offices/search` |
| Configuration | The limits and model the Brain runs with | `/v1/dev/runtime` |
| Storage | Partial: the production Brain's numbers load; this Brain has no storage route | `/v1/storage` |

Documents, Chat Logs, Feedback and Eval Runs are switched off: they were built for an
older Brain and read routes this one does not serve, so each shows a "switched off" card. Their code
was removed on 2026-11-17 (git history keeps it). Artifacts, Endpoints and Trace Replay do not exist yet. The Roadmap page lists all of this
from `lib/navigation.ts`; its "connected" count is of pages, and the Roadmap page itself is one.

## Ask & Inspect

It sends the conversation as `{ "messages": [...], "omittedMessages": n }`: the most recent part of
the history, with a count of older messages left out. The Brain returns JSON with an answer, a status
(`answered`, `partial`, `clarification` or `unavailable`), trusted citations, a request ID and the
dataset version. Because this app sends `x-rockygpt-diagnostics: 1`, a development Brain also returns
a `trace` (each office lookup the model made) and `metrics` (who decided, model calls, model spend,
offices shown, how the model finished). The Trace tab says "This Brain sent no trace" when a Brain
sends neither.

Answer-quality evaluation lives in the sibling `rockygpt-evals` repository.

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
| `SERVICE_TOKEN` | for a protected Brain | Shared server-side service token; must match the Brain (the old name `STAGING_SERVICE_TOKEN` is still read). |
| `PRODUCTION_BRAIN_URL` | no | The production Brain the Storage page reads; defaults to the public service. |

The Dev UI does not connect to a database or import another repository's source. It calls only Brains:
the one at `BRAIN_URL`, and, for the Storage page, the production Brain at `PRODUCTION_BRAIN_URL`.

## Root-to-answer inspection

Ask & Inspect's Trace tab shows a measured timing breakdown followed by the
recorded Ramapo → Offices → office paths, including failures.
Answer text and sources remain in their own tabs; tool details are collapsed. Emergency contact paths are labelled as code traversal.
Older responses without paths are labelled as having no recorded graph path.
Each path node opens Campus Graph in the same tab, preserving the conversation. The
link carries the dataset, identity hash, selected fields and lookup time. Campus
Graph uses `GET /v1/dev/graph/node` to show that node's children and evidence. It
exposes only the office branch; other entity kinds are not yet browsable here.
A changed publication produces an explicit error with a link to the current root.

One `graph_lookup` runs the complete path in code. The trace distinguishes this
from older `graph_open` results, which made one model decision per step.

The conversation, composer draft, selected turn, and inspector tab are saved in
`sessionStorage` for the current browser tab. They survive section navigation and
reloads. Clear turns also clears the saved turns. A request interrupted by a reload
is kept as failed rather than left pending or automatically resent. If tab storage
cannot save, the UI prompts the developer to export before leaving.

Timing covers Send → response ready (before React paints). Browser preparation,
Brain stages, response encoding, transport/proxy overhead, body reading and decoding
are accounted for exactly once, in integer microseconds displayed as milliseconds.
Nested server work replaces its parent interval; it is not counted twice. Provider
time includes its network round trip. Surrounding transport/proxy/browser wait is
combined, not attributed to invented individual stages. The total matches the turn
header and exported timing. Older or interrupted responses without detailed timings
show their unmeasured interval explicitly.

The root-first, timing, trace cleanup and tab persistence changes have not been
tested or built at the user's request.
