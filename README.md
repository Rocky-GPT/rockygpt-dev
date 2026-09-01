# rockygpt-dev

The RockyGPT developer control room remains a sibling product to `rockygpt-ui`,
not a mode of it.

The existing layout and visual system are preserved while the Brain is rebuilt.
Its current live Brain surface is:

- `GET /health`
- `GET /readiness`
- `POST /v1/chat`

The Ask & Inspect screen sends the complete ordered conversation and displays
the returned capability label, model name, and raw request/response. There is no
capability execution or transportation-specific inspection in this phase.

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

The Dev UI does not connect to a database or import another repository's source.
