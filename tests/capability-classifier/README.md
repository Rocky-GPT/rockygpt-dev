# Capability classifier acceptance suite

`cases.json` contains exactly 250 labeled cases:

- 232 independent questions, each with a fresh one-message conversation
- 18 real multi-turn scenarios, each with its own ordered history

Every case has an ordered, unique `expected` capability list. Run the live,
strict semantic evaluation with `npm run test:classifier`. The harness makes one
model attempt per case, defaults to one worker, and reports HTTP failures
separately from exact ordered-label accuracy. Request starts are spaced by four
seconds by default to respect the provider's token-per-minute limit. The harness
never retries a failed case.

`diagnostics.json` records the server-log diagnosis for the original blank HTTP
500 responses. `initial-run-results.json` preserves that run, while
`latest-results.json` preserves the final acceptance measurement.
`boundary-regression-results.json` records the focused post-run verification of
the two repeated ownership boundaries corrected from that measurement.

`expanded-cases.json` contains the additional 412-question review set: 368
isolated independent cases, 31 follow-up cases with explicit ordered histories,
and 13 safety/privacy/security cases retained for inspection but excluded from
semantic accuracy. `raw-run-412-2026-09-02.json` preserves the isolated model
outputs. `evaluate-expanded.mjs` reuses those outputs, runs only the reconstructed
follow-ups, and writes `expanded-results.json`; set
`CLASSIFIER_EVAL_REUSE_RESULTS=1` to rescore existing outputs without another
model call.
