import { randomUUID } from 'node:crypto';
import type { ConfigIssue, IssueCategory, IssueSeverity } from '../types';

/** Build a ConfigIssue with a fresh id. */
export function issue(
  severity: IssueSeverity,
  confidence: number,
  category: IssueCategory,
  title: string,
  description: string,
  recommendedFix: string,
  extras: Partial<ConfigIssue> = {},
): ConfigIssue {
  return {
    id: randomUUID(),
    severity,
    confidence,
    category,
    title,
    description,
    evidence: [],
    recommendedFix,
    ...extras,
  };
}
