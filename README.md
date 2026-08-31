# rockygpt-dev

The RockyGPT developer control room. It remains a sibling product to
`rockygpt-ui`, not a mode of it.

The existing layout, visual system, and developer-tool components are preserved
while the Brain is rebuilt cleanly. For now, the only live Brain connection is:

- `GET /health`
- `GET /readiness`
- `POST /v1/chat`

The existing Ask & Inspect screen sends the complete ordered conversation as
`messages` and displays the Brain’s single-model response, model name, and raw
request/response. Next-shuttle answers also display the deterministic departure,
calculation method, active database dataset, selected trip record, collection
time, and official source provenance. Other campus
data, logs, feedback, and their former
proxy routes remain disconnected. The Dev UI does not emulate missing Brain
behavior.

## Running

```bash
npm install
cp .env.example .env
npm run dev
```

The Dev UI runs at `http://localhost:3100`. The Brain shell defaults to
`http://127.0.0.1:8000` in local development.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `BRAIN_URL` | in production | Brain service address; local development falls back to `http://127.0.0.1:8000`. |

The Dev UI does not connect to a database or import another repository’s source.
It remains local-only until authentication is designed for future protected
developer surfaces.
