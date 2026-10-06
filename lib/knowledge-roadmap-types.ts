/**
 * @module lib/knowledge-roadmap-types
 * The shape of the knowledge roadmap: what the bot may do with data at each level, and what
 * kind of knowledge the bot and its database hold to do it.
 */

/** Where a piece of work stands today. `never` is a decision, not a gap. */
export type Progress = 'built' | 'partial' | 'not_started' | 'never';

export interface KnowledgeType {
  /** The kind of knowledge, in plain words. */
  type: string;
  examples: string;
  /** How the database holds it: a record, a computed view, a document passage, a link. */
  heldAs: string;
}

export interface DomainSlice {
  domain: string;
  /** The smallest useful, checkable piece of this domain at this level. */
  firstSlice: string;
  progress: Progress;
  /** What is built today, or what it waits on. */
  note?: string;
  /** S, M or L, from the analysis. */
  size?: 'S' | 'M' | 'L';
}

export interface KnowledgeLevel {
  level: number;
  name: string;
  /** One sentence: who writes the answer. */
  answerMadeBy: string;
  whatTheBotDoes: string;
  exampleQuestions: string[];
  knowledge: KnowledgeType[];
  databaseMustHave: string[];
  howAnswersAreMade: string;
  guardrails: string;
  domains: DomainSlice[];
  needsFromEarlier?: string;
  doneWhen: string;
  exitTest: string;
}

export interface FoundationItem {
  item: string;
  why: string;
  progress: Progress;
}

export interface KnowledgeRoadmap {
  /** The date the roadmap was written, as shown on the page. */
  asOf: string;
  /** What the roadmap does not know, shown at the top. */
  caveat: string;
  foundations: FoundationItem[];
  levels: KnowledgeLevel[];
  notYet: string[];
  decisions: string[];
}

export const PROGRESS_LABEL: Record<Progress, string> = {
  built: 'built',
  partial: 'partly built',
  not_started: 'not started',
  never: 'not planned',
};

/** The progress of a level: how many of its domains are built, partly built, or not. */
export function levelProgress(level: KnowledgeLevel): { built: number; partial: number; total: number } {
  const planned = level.domains.filter((domain) => domain.progress !== 'never');
  return {
    built: planned.filter((domain) => domain.progress === 'built').length,
    partial: planned.filter((domain) => domain.progress === 'partial').length,
    total: planned.length,
  };
}
