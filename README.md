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
