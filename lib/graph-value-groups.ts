import type { AttachedValue } from './graph-projection.ts';

export interface AttachedValueGroup {
  value: unknown;
  assertions: AttachedValue[];
  sourceCount: number;
}

// Projection values are JSON. Compare structure without changing strings,
// coercing primitive types, or treating array order as interchangeable.
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]));
  }
  // Non-JSON objects cannot be declared equal merely because they have no keys.
  const plain = (value: object) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
  if (!plain(left) || !plain(right)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length &&
    keys.every(key => Object.hasOwn(rightRecord, key) && sameValue(leftRecord[key], rightRecord[key]));
}

/** Group equal values within one field, retaining every original assertion and
 * its distinct provenance/caveats. The first occurrence controls display order. */
export function groupAttachedValues(values: readonly AttachedValue[]): AttachedValueGroup[] {
  const groups: AttachedValueGroup[] = [];
  for (const attached of values) {
    const group = groups.find(candidate => sameValue(candidate.value, attached.value));
    if (!group) {
      groups.push({ value: attached.value, assertions: [attached], sourceCount: 1 });
    } else {
      if (!group.assertions.some(existing => existing.assertion.source_id === attached.assertion.source_id)) group.sourceCount++;
      group.assertions.push(attached);
    }
  }
  return groups;
}
