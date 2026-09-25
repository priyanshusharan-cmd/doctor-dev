import type { TestGap, ConfigIssue, PriorityFinding, HealthScore } from '../types';
/**
 * Combine test gaps and config issues into a prioritized finding list.
 * Findings represent the most impactful problems the developer should fix first.
 */
export declare function buildPriorityFindings(testGaps: TestGap[], configIssues: ConfigIssue[]): PriorityFinding[];
/**
 * Calculate the health score from test gaps and config issues.
 * Scores are deterministic and explainable — based on real findings.
 */
export declare function calculateHealthScore(totalSourceFiles: number, testGaps: TestGap[], configIssues: ConfigIssue[], totalTestFiles: number): HealthScore;
