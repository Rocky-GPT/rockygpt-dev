# Capability classifier acceptance suite

`cases.json` contains exactly 250 labeled cases:

- 232 independent questions, each with a fresh one-message conversation
- 18 real multi-turn scenarios, each with its own ordered history

Every case has an ordered, unique `expected` capability list. Run the live,
strict semantic evaluation with `npm run test:classifier`. The harness makes one
model attempt per case, defaults to one worker, and reports HTTP failures
separately from exact ordered-label accuracy. It never retries a failed case.

`diagnostics.json` records the server-log diagnosis for the original blank HTTP
500 responses. `initial-run-results.json` preserves that run, while
`latest-results.json` preserves the final acceptance measurement.
`boundary-regression-results.json` records the focused post-run verification of
the two repeated ownership boundaries corrected from that measurement.
