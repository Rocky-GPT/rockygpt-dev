import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(await readFile(join(directory, 'cases.json'), 'utf8'));
const endpoint = process.env.ROCKYGPT_BRAIN_URL ?? 'http://127.0.0.1:8000/v1/chat';
const concurrency = Number.parseInt(process.env.CLASSIFIER_EVAL_CONCURRENCY ?? '1', 10);
const cases = [
  ...dataset.independentCases.map((testCase) => ({ ...testCase, kind: 'independent' })),
  ...dataset.multiTurnScenarios.map((testCase) => ({ ...testCase, kind: 'multi_turn' })),
];
const results = new Array(cases.length);
let nextIndex = 0;
let completed = 0;

if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('CLASSIFIER_EVAL_CONCURRENCY must be a positive integer');
}

const allowedLabels = new Set(dataset.labels);
if (cases.length !== 250 || new Set(cases.map((testCase) => testCase.id)).size !== 250) {
  throw new Error('The classifier suite must contain exactly 250 uniquely identified cases');
}
for (const testCase of cases) {
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
    testCase.expected.some((label) => !allowedLabels.has(label))
  ) {
    throw new Error(`${testCase.id} has an invalid expected capability list`);
  }
  if (testCase.expected.includes('clarification') && testCase.expected.length !== 1) {
    throw new Error(`${testCase.id} illegally combines clarification with another label`);
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

async function evaluateCase(testCase) {
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
    const semanticPass =
      response.ok && JSON.stringify(actual) === JSON.stringify(testCase.expected);
    return {
      id: testCase.id,
      kind: testCase.kind,
      messages: testCase.messages,
      expected: testCase.expected,
      actual,
      semanticPass,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      response: body,
      rawResponse: body === null ? rawText : undefined,
    };
  } catch (error) {
    return {
      id: testCase.id,
      kind: testCase.kind,
      messages: testCase.messages,
      expected: testCase.expected,
      actual: null,
      semanticPass: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function worker() {
  while (true) {
    const index = nextIndex++;
    if (index >= cases.length) return;
    results[index] = await evaluateCase(cases[index]);
    completed += 1;
    if (completed % 10 === 0 || completed === cases.length) {
      process.stdout.write(`Completed ${completed}/${cases.length}\n`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const httpFailures = results.filter((result) => result.httpStatus !== 200);
const classified = results.filter((result) => result.httpStatus === 200);
const semanticFailures = classified.filter((result) => !result.semanticPass);
const semanticCorrect = classified.length - semanticFailures.length;
const endToEndFailures = results.filter((result) => !result.semanticPass);
const independent = results.filter((result) => result.kind === 'independent');
const multiTurn = results.filter((result) => result.kind === 'multi_turn');
const independentClassified = independent.filter((result) => result.httpStatus === 200);
const multiTurnClassified = multiTurn.filter((result) => result.httpStatus === 200);
const independentCorrect = independentClassified.filter(
  (result) => result.semanticPass
).length;
const multiTurnCorrect = multiTurnClassified.filter((result) => result.semanticPass).length;
const latencies = results.map((result) => result.latencyMs);
const report = {
  generatedAt: new Date().toISOString(),
  endpoint,
  concurrency,
  summary: {
    total: results.length,
    httpSuccess: classified.length,
    httpFailures: httpFailures.length,
    semanticCorrect,
    semanticIncorrect: semanticFailures.length,
    semanticAccuracy: classified.length === 0 ? null : semanticCorrect / classified.length,
    endToEndPass: results.length - endToEndFailures.length,
    endToEndPassRate: (results.length - endToEndFailures.length) / results.length,
    independentCorrect,
    independentClassified: independentClassified.length,
    independentSemanticAccuracy:
      independentClassified.length === 0
        ? null
        : independentCorrect / independentClassified.length,
    multiTurnCorrect,
    multiTurnClassified: multiTurnClassified.length,
    multiTurnSemanticAccuracy:
      multiTurnClassified.length === 0 ? null : multiTurnCorrect / multiTurnClassified.length,
    averageLatencyMs: Math.round(
      latencies.reduce((total, latency) => total + latency, 0) / latencies.length
    ),
    minimumLatencyMs: Math.min(...latencies),
    maximumLatencyMs: Math.max(...latencies),
  },
  semanticFailures: semanticFailures.map((result) => ({
    id: result.id,
    expected: result.expected,
    actual: result.actual,
    httpStatus: result.httpStatus,
  })),
  transportFailures: httpFailures.map((result) => ({
    id: result.id,
    httpStatus: result.httpStatus,
    reason: result.response?.reason ?? result.error ?? 'unknown',
  })),
  results,
};

await writeFile(
  join(directory, 'latest-results.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);
process.stdout.write(`${JSON.stringify(report.summary)}\n`);
process.exitCode = endToEndFailures.length === 0 ? 0 : 1;
