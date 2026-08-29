# rockygpt-dev

The RockyGPT developer control room. A sibling product to `rockygpt-ui`, not a
mode of it.

    rockygpt-ui   = only what a student should ever see
    rockygpt-dev  = everything you need to understand, debug, test, and operate

## The boundary

```
Student UI ──→ Brain ──→ Neon
Dev UI     ──→ Brain ──→ Neon
```

**Separate interface, not separate architecture.** This app:

- never connects to Neon, or to any database
- never imports another repository's source
- never becomes a second truth path

Every fact it shows arrives over versioned HTTP from `rockygpt-brain`. That is
the contract in `rockygpt-infra/docs/application-isolation.md`, and it is the
reason this app can exist at all without doubling the number of places a campus
fact can come from.

## Running

    npm install
    cp .env.example .env
    npm run dev            # http://localhost:3100

The brain must be up. From the repository root:

    ./run-local.sh start   # brain :8000, student UI :3000

Port 3100 is deliberate: `run-local.sh` culls ports 3000 and 8000 on every
start, so this app survives a stack restart.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `BRAIN_URL` | yes | The brain. Defaults to `http://127.0.0.1:8000` outside production. |
| `ADMIN_API_TOKEN` | for Logs | Bearer token for `/v1/admin/*`. Without it the Logs page is empty. |
| `BRAIN_TIMEOUT_MS` | no | Proxy timeout, default 120000. Never applied to the log stream. |

## What is not built, and why

The nav shows every intended section, including the ones that do not work yet,
each marked with the brain endpoint it is waiting on. `/roadmap` renders the
same list as a table. Nothing is hidden: the shape of what is missing is itself
information.

The largest gap is **replaying a stored turn**. Five of the eight `brainTrace`
boxes — `question`, `memory`, `understanding`, `context`, `normalizedPlan` — are
never written to the database, and no endpoint returns a stored trace. So you
can inspect a turn you asked yourself, but not one a student asked. Re-asking
their question produces a different turn, against different data, at a
different time. That endpoint is the highest-value thing to add next.

## A warning

Pointed at a production `BRAIN_URL` with a production `ADMIN_API_TOKEN`, this
app reads **real student chat logs**. It is local-only today and refuses to
start on Vercel for exactly that reason. Before it is ever deployed it needs
real authentication.
