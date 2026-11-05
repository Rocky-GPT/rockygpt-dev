import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetBar, budgetFit, monthName, readBudget } from '../lib/budget.ts';

const body = {
  environment: 'development',
  month: '2026-11-01',
  paused: false,
  capNusd: 10_000_000_000,
  extraNusd: 10_000_000_000,
  allowanceNusd: 20_000_000_000,
  settledNusd: 10_400_000_000,
  heldNusd: 3_570_000_000,
  reservedNusd: 920_000_000,
  reservedCalls: 12,
  uncertainNusd: 2_650_000_000,
  uncertainCalls: 870,
  leftNusd: 6_030_000_000,
  checkedAt: '2026-11-05T21:31:00Z',
};

test('the Brain reply reads into dollars', () => {
  const budget = readBudget(body);
  assert.equal(budget.allowance, 20);
  assert.equal(budget.cap, 10);
  assert.equal(budget.extra, 10);
  assert.equal(budget.settled, 10.4);
  assert.equal(budget.held, 3.57);
  assert.equal(budget.left, 6.03);
  assert.equal(budget.uncertainCalls, 870);
  assert.equal(monthName(budget.month), 'November');
});

test('a reply that is not a budget reads as nothing', () => {
  assert.equal(readBudget(null), null);
  assert.equal(readBudget({ error: { code: 'ledger_unavailable' } }), null);
  assert.equal(readBudget({ ...body, leftNusd: -1 }), null);
  assert.equal(readBudget({ ...body, month: undefined }), null);
});

test('a run fits, is over, or the month is spent or paused', () => {
  const budget = readBudget(body);
  assert.equal(budgetFit(budget, 0.3), 'fits');
  assert.equal(budgetFit(budget, 6.5), 'over');
  assert.equal(budgetFit({ ...budget, left: 0 }, 0.3), 'empty');
  assert.equal(budgetFit({ ...budget, paused: true }, 0.3), 'paused');
});

test('the bar never adds up to more than the whole allowance', () => {
  const budget = readBudget(body);
  const bar = budgetBar(budget, 0.3);
  assert.equal(Math.round(bar.settled), 52);
  assert.equal(Math.round(bar.held * 100) / 100, 17.85);
  assert.equal(Math.round(bar.run * 100) / 100, 1.5);
  const full = budgetBar({ ...budget, settled: 19, held: 3 }, 5);
  assert.equal(full.settled + full.held + full.run, 100);
  assert.equal(full.run, 0);
});
