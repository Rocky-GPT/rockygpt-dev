import type { Turn } from '@/components/ask/types';

export interface ResponseAssertion {
  label: string;
  passed: boolean;
}

export interface ResponseAssessment {
  passed: boolean;
  assertions: ResponseAssertion[];
}

/** Small invariant check for one inspected Step 5 response, separate from HTTP success. */
export function assessStep5Response(turn: Turn): ResponseAssessment | undefined {
  if (turn.status === 'pending') return undefined;

  const raw = turn.raw;
  const answer = typeof raw?.answer === 'string' ? raw.answer : '';
  const interpretation = isRecord(raw?.transportationInterpretation)
    ? raw.transportationInterpretation
    : undefined;
  const selected = interpretation?.selected === true;
  const request = isRecord(interpretation?.request) ? interpretation.request : undefined;
  const result = isRecord(raw?.transportationResult) ? raw.transportationResult : undefined;
  const provenance = isRecord(raw?.transportationProvenance)
    ? raw.transportationProvenance
    : undefined;
  const executed = request?.kind === 'query' || request?.kind === 'comparison';
  const interpretationFailed =
    request?.kind === 'clarification' && request.reason === 'interpretation_failure';

  const assertions: ResponseAssertion[] = [
    { label: 'HTTP request completed successfully', passed: turn.status === 'ok' },
    { label: 'Response contains a final answer', passed: answer.trim().length > 0 },
    {
      label: 'Step 5B placeholder is absent',
      passed: !answer.includes('Trusted schedule execution is not implemented in Step 5B'),
    },
    {
      label: 'Transportation interpretation has a valid selection state',
      passed:
        interpretation !== undefined &&
        typeof interpretation.selected === 'boolean' &&
        (selected ? request !== undefined : interpretation.request === null),
    },
    {
      label: 'Model interpretation completed without a recovery failure',
      passed: !interpretationFailed,
    },
  ];

  if (executed) {
    assertions.push(
      { label: 'Selected request has a deterministic result', passed: result !== undefined },
      { label: 'Executed result includes trusted provenance', passed: provenance !== undefined },
      {
        label: 'Deterministic result echoes the interpreted request',
        passed: result !== undefined && sameJson(result.request, request),
      },
      {
        label: 'Top-level provenance echoes the deterministic result',
        passed: result !== undefined && sameJson(result.provenance, provenance),
      },
      {
        label: 'Final answer is labeled as scheduled data',
        passed: answer.toLocaleLowerCase().includes('scheduled'),
      }
    );
  } else if (!selected) {
    assertions.push({
      label: 'Normal chat has no transportation execution payload',
      passed: result === undefined && provenance === undefined,
    });
  }

  return {
    passed: assertions.every((assertion) => assertion.passed),
    assertions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
