# rockygpt-dev

The RockyGPT developer control room remains a sibling product to `rockygpt-ui`,
not a mode of it.

Its live Brain surface is:

- `GET /health`
- `GET /readiness`
- `POST /v1/chat`

The Ask & Inspect screen sends the complete ordered conversation as
`{ "messages": [{ "role": "user", "content": "..." }] }`. The client carries
prior user and assistant messages on every turn. The Brain returns JSON with an
answer, status (`answered`, `partial`, `clarification`, or `unavailable`), trusted
citations, a compact tool trace, model name, request ID, and dataset version.
The inspector shows those results and the exact request and response bytes.
It does not depend on internal classifier labels or pipeline stages.

Answer-quality evaluation lives in the sibling `rockygpt-evals` repository.

## Identity Explorer

Open **Data → Identity Explorer** (`/data/entities`) to inspect the active
identity release. Search names, aliases or persistent IDs and filter by kind.
The diagram separates linked original records from explicit relationships;
click a source to inspect its section or a related person/program to navigate.
Selections are addressable with `?entity=<persistent-id>`.

The evidence inspector preserves source IDs, timestamps and conflicting values.
Missing sections remain unknown. Faculty course lists are undated; operating
hours do not establish staff or phone availability. Apply a campus date and meal
to inspect dining evidence; menus show a labelled sample of up to 12 records.
The Unresolved view explains links that still need evidence. Both the identity
and the exact assembled profile can be downloaded as JSON.

This read-only view uses `GET /v1/dev/identities` and
`GET /v1/dev/identities/{id}` through the server-side Brain proxy. The Brain only
exposes these routes when `BRAIN_ENVIRONMENT=development`. It uses the existing
identity artifact and profile lookup without model calls or a second database.
Release/hash checks prevent mixing an identity map with a different profile
release. The Student UI is unchanged.

Verify changes with `npm run test:identities`, `npm run typecheck`,
`npm run lint`, and `npm run build`.

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

The Dev UI does not connect to a database or import another repository's source.
