import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('./', import.meta.url);
const dataset = JSON.parse(await readFile(new URL('expanded-cases.json', directory), 'utf8'));
const rawRun = JSON.parse(
  await readFile(new URL('raw-run-412-2026-09-02.json', directory), 'utf8')
);
const endpoint = process.env.ROCKYGPT_BRAIN_URL ?? 'http://127.0.0.1:8000/v1/chat';
const reuseResults = process.env.CLASSIFIER_EVAL_REUSE_RESULTS === '1';
const minimumIntervalMs = Number.parseInt(
  process.env.CLASSIFIER_EVAL_MIN_INTERVAL_MS ?? '4000',
  10
);

const allCases = [
  ...dataset.independentCases.map((testCase) => ({ ...testCase, kind: 'independent' })),
  ...dataset.multiTurnScenarios.map((testCase) => ({ ...testCase, kind: 'multi_turn' })),
  ...dataset.excludedCases.map((testCase) => ({ ...testCase, kind: 'excluded' })),
];
const allowedLabels = new Set(dataset.labels);

if (allCases.length !== 412 || new Set(allCases.map(({ id }) => id)).size !== 412) {
  throw new Error('Expanded suite must contain exactly 412 unique cases');
}
for (const testCase of allCases) {
  if (testCase.kind === 'independent' && testCase.messages.length !== 1) {
    throw new Error(`${testCase.id} must be an isolated one-message case`);
  }
  if (testCase.kind === 'multi_turn' && testCase.messages.length < 3) {
    throw new Error(`${testCase.id} must contain a real multi-turn history`);
  }
  if (
    !Array.isArray(testCase.expected) ||
    testCase.expected.length === 0 ||
    new Set(testCase.expected).size !== testCase.expected.length ||
    testCase.expected.some((label) => !allowedLabels.has(label)) ||
    (testCase.expected.includes('clarification') && testCase.expected.length !== 1)
  ) {
    throw new Error(`${testCase.id} has invalid expected labels`);
  }
  if (
    testCase.messages.at(-1)?.role !== 'user' ||
    testCase.messages.some(
      (message) =>
        !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' ||
        message.content.length === 0
    )
  ) {
    throw new Error(`${testCase.id} has an invalid ordered message history`);
  }
}

const rawByIndex = new Map(rawRun.results.map((result) => [result.index, result]));
const exactMatch = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const fromRaw = (testCase) => {
  const raw = rawByIndex.get(testCase.sourceIndex);
  if (!raw) throw new Error(`Missing raw result for ${testCase.id}`);
  return {
    ...testCase,
    actual: raw.capabilities,
    semanticPass: exactMatch(raw.capabilities, testCase.expected),
    httpStatus: raw.httpStatus,
    latencyMs: raw.latencyMs,
    model: raw.model,
  };
};

const independentResults = dataset.independentCases.map((testCase) => ({
  ...fromRaw(testCase),
  kind: 'independent',
}));
const excludedResults = dataset.excludedCases.map((testCase) => ({
  ...fromRaw(testCase),
  kind: 'excluded',
}));

const multiTurnResults = [];
const previousByIndex = reuseResults
  ? new Map(
      JSON.parse(await readFile(new URL('expanded-results.json', directory), 'utf8')).results.map(
        (result) => [result.sourceIndex, result]
      )
    )
  : new Map();
for (const [offset, testCase] of dataset.multiTurnScenarios.entries()) {
  if (reuseResults) {
    const previous = previousByIndex.get(testCase.sourceIndex);
    if (!previous) throw new Error(`Missing previous result for ${testCase.id}`);
    multiTurnResults.push({
      ...previous,
      ...testCase,
      kind: 'multi_turn',
      semanticPass:
        previous.httpStatus === 200 && exactMatch(previous.actual, testCase.expected),
    });
    continue;
  }
  if (offset > 0 && minimumIntervalMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, minimumIntervalMs));
  }
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: testCase.messages }),
    });
    const rawText = await response.text();
    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
    const actual = Array.isArray(body?.capabilities) ? body.capabilities : null;
    multiTurnResults.push({
      ...testCase,
      kind: 'multi_turn',
      actual,
      semanticPass: response.ok && exactMatch(actual, testCase.expected),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      model: body?.model ?? null,
      response: body,
      rawResponse: body === null ? rawText : undefined,
    });
  } catch (error) {
    multiTurnResults.push({
      ...testCase,
      kind: 'multi_turn',
      actual: null,
      semanticPass: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  process.stdout.write(`Follow-ups ${offset + 1}/${dataset.multiTurnScenarios.length}\n`);
}

const scoredResults = [...independentResults, ...multiTurnResults].sort(
  (left, right) => left.sourceIndex - right.sourceIndex
);
const allResults = [...scoredResults, ...excludedResults].sort(
  (left, right) => left.sourceIndex - right.sourceIndex
);
const semanticCorrect = scoredResults.filter(({ semanticPass }) => semanticPass).length;
const httpSuccess = scoredResults.filter(({ httpStatus }) => httpStatus === 200).length;
const independentCorrect = independentResults.filter(({ semanticPass }) => semanticPass).length;
const multiTurnCorrect = multiTurnResults.filter(({ semanticPass }) => semanticPass).length;
const report = {
  generatedAt: new Date().toISOString(),
  endpoint,
  minimumIntervalMs,
  summary: {
    sourceCases: allResults.length,
    scoredCases: scoredResults.length,
    excludedCases: excludedResults.length,
    httpSuccess,
    httpFailures: scoredResults.length - httpSuccess,
    semanticCorrect,
    semanticIncorrect: scoredResults.length - semanticCorrect,
    semanticAccuracy: semanticCorrect / scoredResults.length,
    independentCorrect,
    independentCases: independentResults.length,
    independentSemanticAccuracy: independentCorrect / independentResults.length,
    multiTurnCorrect,
    multiTurnCases: multiTurnResults.length,
    multiTurnSemanticAccuracy: multiTurnCorrect / multiTurnResults.length,
  },
  semanticFailures: scoredResults
    .filter(({ semanticPass }) => !semanticPass)
    .map(({ id, sourceIndex, kind, messages, expected, actual, httpStatus }) => ({
      id,
      sourceIndex,
      kind,
      question: messages.at(-1).content,
      expected,
      actual,
      httpStatus,
    })),
  transportFailures: scoredResults
    .filter(({ httpStatus }) => httpStatus !== 200)
    .map(({ id, sourceIndex, httpStatus, error, response }) => ({
      id,
      sourceIndex,
      httpStatus,
      reason: response?.reason ?? error ?? 'unknown',
    })),
  excludedResults,
  results: scoredResults,
};

await writeFile(
  new URL('expanded-results.json', directory),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);
process.stdout.write(`${JSON.stringify(report.summary)}\n`);
