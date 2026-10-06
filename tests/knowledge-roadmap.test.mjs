import assert from 'node:assert/strict';
import test from 'node:test';
import { KNOWLEDGE_ROADMAP } from '../lib/knowledge-roadmap.ts';
import { PROGRESS_LABEL, levelProgress } from '../lib/knowledge-roadmap-types.ts';

const levels = KNOWLEDGE_ROADMAP.levels;
const everyText = (value) =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(everyText)
    : value && typeof value === 'object' ? Object.values(value).flatMap(everyText) : [];

test('levels count up from 1 and each says who writes the answer and how it is tested', () => {
  assert.ok(levels.length >= 2);
  levels.forEach((level, index) => {
    assert.equal(level.level, index + 1);
    assert.ok(level.name.trim().length >= 3, `level ${level.level} name`);
    for (const field of ['answerMadeBy', 'whatTheBotDoes', 'howAnswersAreMade', 'guardrails', 'doneWhen', 'exitTest']) {
      assert.ok(level[field].trim().length > 10, `level ${level.level} ${field}`);
    }
    assert.ok(level.exampleQuestions.length >= 2 && level.knowledge.length >= 1 && level.databaseMustHave.length >= 1);
    assert.ok(level.domains.length >= 1, `level ${level.level} has domains`);
    for (const domain of level.domains) {
      assert.ok(domain.domain && domain.firstSlice, `${level.name}: ${domain.domain}`);
      assert.ok(domain.progress in PROGRESS_LABEL, `${domain.domain} progress`);
      assert.ok(domain.size === undefined || ['S', 'M', 'L'].includes(domain.size));
    }
  });
});

test('the roadmap states that there is no real student data, and never calls the demand known', () => {
  assert.match(KNOWLEDGE_ROADMAP.caveat, /no real student data/i);
  assert.ok(KNOWLEDGE_ROADMAP.foundations.length >= 3);
  assert.ok(KNOWLEDGE_ROADMAP.notYet.length >= 1 && KNOWLEDGE_ROADMAP.decisions.length >= 1);
});

test('level progress counts only planned domains', () => {
  const sample = { domains: [
    { progress: 'built' }, { progress: 'partial' }, { progress: 'not_started' }, { progress: 'never' },
  ] };
  assert.deepEqual(levelProgress(sample), { built: 1, partial: 1, total: 3 });
});

test('the text is plain: no em dashes, no curly quotes, no unfinished markers', () => {
  for (const text of everyText(KNOWLEDGE_ROADMAP)) {
    assert.doesNotMatch(text, /[—–‘’“”]/, text.slice(0, 60));
    assert.doesNotMatch(text, /\b(TODO|TBD|lorem ipsum)\b/i, text.slice(0, 60));
  }
});
