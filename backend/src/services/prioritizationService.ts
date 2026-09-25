import { v4 as uuidv4 } from 'uuid';
import type {
  TestGap,
  ConfigIssue,
  PriorityFinding,
  HealthScore,
  HealthState,
  FindingLevel,
  TestProfile,
} from '../types';

// ─── Priority Findings ────────────────────────────────────────────────────────

/**
 * Combine test gaps and config issues into a prioritized finding list.
 * Findings represent the most impactful problems the developer should fix first.
 */
export function buildPriorityFindings(
  testGaps: TestGap[],
  configIssues: ConfigIssue[],
): PriorityFinding[] {
  const findings: PriorityFinding[] = [];

  // ── Critical test gaps ────────────────────────────────────────────────────
  const criticalGaps = testGaps.filter((g) => g.severity === 'critical');
  if (criticalGaps.length > 0) {
    findings.push({
      id: uuidv4(),
      level: 'critical',
      title: `${criticalGaps.length} critical function(s) have no test coverage`,
      description: `${criticalGaps.length} high-importance symbol(s) — including ${criticalGaps.slice(0, 2).map((g) => g.symbolName ?? g.filePath).join(', ')} — have no automated tests.`,
      category: 'testing',
      recommendation: 'Add unit tests for these functions, starting with the happy path and then error paths.',
      estimatedImpact: 'A bug in untested critical code could cause production failures with no automated safety net.',
      sourceGapIds: criticalGaps.map((g) => g.id),
      sourceIssueIds: [],
    });
  }

  // ── High-severity config issues ───────────────────────────────────────────
  const criticalConfigIssues = configIssues.filter((i) => i.severity === 'critical' || i.severity === 'high');
  if (criticalConfigIssues.length > 0) {
    findings.push({
      id: uuidv4(),
      level: criticalConfigIssues.some((i) => i.severity === 'critical') ? 'critical' : 'high',
      title: `${criticalConfigIssues.length} critical/high configuration issue(s) detected`,
      description: criticalConfigIssues.slice(0, 2).map((i) => i.title).join('; '),
      category: 'configuration',
      recommendation: 'Fix the configuration issues before deployment — they can cause runtime failures.',
      estimatedImpact: 'Misconfiguration can cause the application to fail on startup or behave incorrectly in production.',
      sourceGapIds: [],
      sourceIssueIds: criticalConfigIssues.map((i) => i.id),
    });
  }

  // ── Security-related issues ────────────────────────────────────────────────
  const securityIssues = configIssues.filter((i) => i.category === 'security');
  const authGaps = testGaps.filter((g) => g.category === 'missing_auth_test');
  if (securityIssues.length > 0 || authGaps.length > 0) {
    findings.push({
      id: uuidv4(),
      level: 'high',
      title: `Security-related gaps require attention`,
      description: [
        securityIssues.length > 0 ? `${securityIssues.length} security configuration issue(s)` : '',
        authGaps.length > 0 ? `${authGaps.length} authentication path(s) not tested` : '',
      ].filter(Boolean).join(' and '),
      category: 'security',
      recommendation: 'Add authorization tests and fix security configuration issues.',
      estimatedImpact: 'Auth bugs can expose sensitive data or allow unauthorized access.',
      sourceGapIds: authGaps.map((g) => g.id),
      sourceIssueIds: securityIssues.map((i) => i.id),
    });
  }

  // ── API routes without tests ───────────────────────────────────────────────
  const routeGaps = testGaps.filter((g) => g.category === 'no_test' && g.title.includes('API route'));
  if (routeGaps.length > 0) {
    findings.push({
      id: uuidv4(),
      level: 'high',
      title: `${routeGaps.length} API route(s) have no test coverage`,
      description: `Routes including ${routeGaps.slice(0, 3).map((g) => g.title.replace('No test for: ', '')).join(', ')} are not covered by any detected test.`,
      category: 'reliability',
      recommendation: 'Add integration tests for all API routes, covering success and error cases.',
      estimatedImpact: 'Untested API routes may silently break in production without any automated detection.',
      sourceGapIds: routeGaps.map((g) => g.id),
      sourceIssueIds: [],
    });
  }

  // ── CI gaps ───────────────────────────────────────────────────────────────
  const ciIssues = configIssues.filter((i) => i.category === 'ci');
  if (ciIssues.length > 0) {
    findings.push({
      id: uuidv4(),
      level: 'medium',
      title: `CI/CD pipeline has ${ciIssues.length} issue(s)`,
      description: ciIssues.map((i) => i.title).join('; '),
      category: 'reliability',
      recommendation: 'Fix CI configuration to ensure tests run automatically on every push.',
      estimatedImpact: 'Broken CI allows regressions to merge undetected.',
      sourceGapIds: [],
      sourceIssueIds: ciIssues.map((i) => i.id),
    });
  }

  // Sort by level
  const levelOrder: Record<FindingLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return findings.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
}

// ─── Health Score ─────────────────────────────────────────────────────────────

/**
 * Calculate the health score from test gaps and config issues.
 * Scores are deterministic and explainable — based on real findings.
 */
export function calculateHealthScore(
  totalSourceFiles: number,
  testGaps: TestGap[],
  configIssues: ConfigIssue[],
  testProfile: TestProfile,
): HealthScore {
  // Testing score: penalize for gaps, reward for actual coverage or evidence
  const criticalGaps = testGaps.filter((g) => g.severity === 'critical').length;
  const highGaps = testGaps.filter((g) => g.severity === 'high').length;
  const mediumGaps = testGaps.filter((g) => g.severity === 'medium').length;

  // Penalize confirmed gaps
  const gapPenalty = criticalGaps * 10 + highGaps * 5 + mediumGaps * 2;
  
  let baseScore = 0;
  if (testProfile.coverage.status === 'ACTUAL_COVERAGE') {
    baseScore = testProfile.coverage.percentage ?? 80;
  } else if (testProfile.coverage.status === 'EVIDENCE_BASED') {
    baseScore = 70; // Sensible default for mature repos with tests but no report
  } else if (testProfile.totalTestFiles > 0) {
    baseScore = 50; // Tests exist but we don't understand them well
  } else {
    baseScore = 20; // No tests found at all
  }

  const testing = Math.max(0, Math.min(100, Math.round(baseScore - gapPenalty)));

  // Config score: penalize for issues
  const criticalIssues = configIssues.filter((i) => i.severity === 'critical').length;
  const highIssues = configIssues.filter((i) => i.severity === 'high').length;
  const mediumIssues = configIssues.filter((i) => i.severity === 'medium').length;
  const configPenalty = criticalIssues * 20 + highIssues * 10 + mediumIssues * 5;
  const configuration = Math.max(0, Math.min(100, Math.round(100 - configPenalty)));

  // Security score: penalize for security config issues + auth test gaps
  const securityIssues = configIssues.filter((i) => i.category === 'security').length;
  const authGaps = testGaps.filter((g) => g.category === 'missing_auth_test').length;
  const securityPenalty = securityIssues * 25 + authGaps * 10;
  const security = Math.max(0, Math.min(100, Math.round(100 - securityPenalty)));

  const overall = Math.round((testing * 0.4 + configuration * 0.35 + security * 0.25));

  const grade =
    overall >= 90 ? 'A' :
    overall >= 75 ? 'B' :
    overall >= 60 ? 'C' :
    overall >= 40 ? 'D' : 'F';

  const state: HealthState =
    overall >= 75 ? 'healthy' :
    overall >= 40 ? 'needs_attention' : 'critical';

  return { overall, testing, configuration, security, grade, state };
}
