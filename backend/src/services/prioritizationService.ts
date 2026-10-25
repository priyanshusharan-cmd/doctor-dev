import { randomUUID } from 'node:crypto';
import type {
  CodeSymbol,
  ConfigIssue,
  FindingLevel,
  HealthScore,
  HealthState,
  IssueSeverity,
  PriorityFinding,
  RouteInfo,
  ScoreDimension,
  ScoreFactor,
  SymbolImportance,
  TestEvidenceSummary,
  TestGap,
  TestMapping,
  TestProfile,
} from '../types';
import { IMPORTANCE_WEIGHT, isAuthRoute, maxImportance } from '../analyzers/importance';

// ─── Priority Findings ────────────────────────────────────────────────────────

/** Title prefix TestPilot uses for untested API route gaps. */
export const ROUTE_GAP_PREFIX = 'API route not tested: ';

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
      id: randomUUID(),
      level: 'critical',
      title: `${criticalGaps.length} critical testing gap(s) found`,
      description: `${criticalGaps.length} critical code path(s) — including ${criticalGaps.slice(0, 2).map((g) => g.symbolName ?? g.title.replace(/^[^:]+:\s*/, '')).join(', ')} — lack adequate automated tests.`,
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
      id: randomUUID(),
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
      id: randomUUID(),
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
  const routeGaps = testGaps.filter((g) => g.category === 'no_test' && g.title.startsWith(ROUTE_GAP_PREFIX));
  if (routeGaps.length > 0) {
    findings.push({
      id: randomUUID(),
      level: 'high',
      title: `${routeGaps.length} API route(s) have no test coverage`,
      description: `Routes including ${routeGaps.slice(0, 3).map((g) => g.title.slice(ROUTE_GAP_PREFIX.length)).join(', ')} are not covered by any detected test.`,
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
      id: randomUUID(),
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

/** How much one finding of each severity removes from a dimension, before confidence. */
const SEVERITY_WEIGHT: Record<IssueSeverity, number> = { critical: 0.35, high: 0.18, medium: 0.08, low: 0.03, info: 0 };

/** Credit a file earns toward the testing score for each kind of test evidence. */
function evidenceCredit(m: TestMapping): number {
  switch (m.coverageStatus) {
    case 'DIRECTLY_TESTED': return 1;
    case 'INDIRECTLY_TESTED': return (m.depth ?? 2) <= 2 ? 0.85 : (m.depth ?? 2) === 3 ? 0.75 : 0.65;
    case 'PARTIALLY_TESTED': return 0.6;
    case 'NOT_ENOUGH_EVIDENCE': return 0.3;
    case 'NOT_TESTED': return 0;
  }
}

export interface ScoreInput {
  /** Mappings for production source files only */
  mappings: TestMapping[];
  symbols: CodeSymbol[];
  routes: RouteInfo[];
  testGaps: TestGap[];
  configIssues: ConfigIssue[];
  testProfile: TestProfile;
}

/** Summarize how much production code has test evidence. */
export function summarizeTestEvidence(input: Pick<ScoreInput, 'mappings' | 'symbols' | 'routes' | 'testGaps'>): TestEvidenceSummary {
  const fileImportance = new Map<string, SymbolImportance>();
  for (const s of input.symbols) {
    if (s.sourceType !== 'production') continue;
    fileImportance.set(s.filePath, maxImportance(fileImportance.get(s.filePath) ?? 'low', s.importance));
  }
  let weighted = 0;
  let total = 0;
  for (const m of input.mappings) {
    const w = IMPORTANCE_WEIGHT[fileImportance.get(m.sourceFile) ?? 'low'];
    total += w;
    weighted += w * evidenceCredit(m);
  }
  const count = (status: TestMapping['coverageStatus']): number => input.mappings.filter((m) => m.coverageStatus === status).length;
  const productionRoutes = input.routes.filter((r) => r.sourceType === 'production');
  return {
    productionFiles: input.mappings.length,
    directlyTested: count('DIRECTLY_TESTED'),
    indirectlyTested: count('INDIRECTLY_TESTED'),
    partiallyTested: count('PARTIALLY_TESTED'),
    untested: count('NOT_TESTED') + count('NOT_ENOUGH_EVIDENCE'),
    weightedRatio: total > 0 ? weighted / total : 1,
    routes: productionRoutes.length,
    untestedRoutes: input.testGaps.filter((g) => g.title.startsWith(ROUTE_GAP_PREFIX)).length,
  };
}

/** Apply findings with diminishing returns: each one removes a share of what is left. */
function applyFindings(
  dimension: ScoreDimension,
  findings: Array<{ severity: IssueSeverity; confidence: number; title: string }>,
  factors: ScoreFactor[],
  start = 100,
): number {
  let score = start;
  for (const f of [...findings].sort((a, b) => SEVERITY_WEIGHT[b.severity] * b.confidence - SEVERITY_WEIGHT[a.severity] * a.confidence)) {
    const loss = score * SEVERITY_WEIGHT[f.severity] * f.confidence;
    if (loss < 0.5) continue;
    score -= loss;
    factors.push({ dimension, label: f.title, points: -Math.round(loss), detail: `${f.severity} severity, ${Math.round(f.confidence * 100)}% confidence` });
  }
  return score;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score repository health. Every deduction is recorded as a factor so the UI can explain it.
 *
 * - Testing: importance-weighted share of production files with test evidence (blended
 *   with a parsed coverage percentage when one exists), less up to 30 points for API
 *   routes no test calls.
 * - Configuration: starts at 100; each issue removes a share of the remaining score
 *   scaled by severity and confidence, so many small issues cannot drive it to zero.
 * - Security: the same for security issues, plus up to 40% for untested auth code.
 */
export function calculateHealthScore(input: ScoreInput): HealthScore {
  const factors: ScoreFactor[] = [];
  const evidence = summarizeTestEvidence(input);

  // ── Testing ───────────────────────────────────────────────────────────────
  let testing: number;
  const pct = input.testProfile.coverage.status === 'ACTUAL_COVERAGE' ? input.testProfile.coverage.percentage : undefined;
  if (evidence.productionFiles === 0) {
    testing = 100;
    factors.push({ dimension: 'testing', label: 'No production source files detected', points: 0 });
  } else if (input.testProfile.totalTestFiles === 0) {
    testing = 0;
    factors.push({ dimension: 'testing', label: 'No automated tests found', points: -100, detail: `${evidence.productionFiles} production file(s) with no test suite` });
  } else {
    const ratioScore = evidence.weightedRatio * 100;
    testing = pct !== undefined ? 0.6 * pct + 0.4 * ratioScore : ratioScore;
    const tested = evidence.directlyTested + evidence.indirectlyTested + evidence.partiallyTested;
    factors.push({
      dimension: 'testing',
      label: `Test evidence for ${tested} of ${evidence.productionFiles} production files`,
      points: -Math.round(100 - ratioScore),
      detail: `${Math.round(ratioScore)}% importance-weighted (${evidence.directlyTested} imported directly, ${evidence.indirectlyTested} indirectly, ${evidence.partiallyTested} by name or path)`,
    });
    if (pct !== undefined) {
      factors.push({ dimension: 'testing', label: `Coverage report: ${pct}% of lines`, points: Math.round(0.6 * pct + 0.4 * ratioScore - ratioScore), detail: 'Blended 60/40 with test evidence' });
    }
    if (evidence.routes > 0 && evidence.untestedRoutes > 0) {
      // A service's API is its contract: 30% of the testing score is route coverage.
      const penalty = 30 * (evidence.untestedRoutes / evidence.routes);
      testing -= penalty;
      factors.push({ dimension: 'testing', label: `${evidence.untestedRoutes} of ${evidence.routes} API routes are never called by a test`, points: -Math.round(penalty) });
    }
  }

  // ── Configuration ─────────────────────────────────────────────────────────
  const configuration = applyFindings('configuration', input.configIssues.filter((i) => i.category !== 'security'), factors);

  // ── Security ──────────────────────────────────────────────────────────────
  let security = applyFindings('security', input.configIssues.filter((i) => i.category === 'security'), factors);
  const authFiles = new Set(input.symbols
    .filter((s) => s.sourceType === 'production' && s.importanceReasons.includes('authentication/authorization logic'))
    .map((s) => s.filePath));
  const untestedAuthFiles = input.mappings.filter((m) => authFiles.has(m.sourceFile)
    && (m.coverageStatus === 'NOT_TESTED' || m.coverageStatus === 'NOT_ENOUGH_EVIDENCE')).length;
  const authRoutes = input.testGaps.filter((g) => g.title.startsWith(ROUTE_GAP_PREFIX) && g.severity === 'critical').length;
  const authSurface = authFiles.size + input.routes.filter((r) => r.sourceType === 'production' && isAuthRoute(r.path)).length;
  if (authSurface > 0 && untestedAuthFiles + authRoutes > 0) {
    const risk = Math.min(1, (untestedAuthFiles + authRoutes) / authSurface);
    const loss = security * 0.4 * risk;
    security -= loss;
    factors.push({ dimension: 'security', label: `${untestedAuthFiles + authRoutes} authentication file(s)/route(s) without tests`, points: -Math.round(loss) });
  }
  const rejectionGaps = input.testGaps.filter((g) => g.category === 'missing_auth_test').slice(0, 3);
  for (const g of rejectionGaps) {
    const loss = security * 0.06 * g.confidence;
    security -= loss;
    factors.push({ dimension: 'security', label: g.title, points: -Math.round(loss) });
  }

  const t = clamp(testing);
  const c = clamp(configuration);
  const sec = clamp(security);
  const overall = clamp(t * 0.45 + c * 0.3 + sec * 0.25);

  const grade: HealthScore['grade'] =
    overall >= 90 ? 'A' :
    overall >= 80 ? 'B' :
    overall >= 70 ? 'C' :
    overall >= 60 ? 'D' : 'F';
  const state: HealthState = overall >= 80 ? 'healthy' : overall >= 60 ? 'needs_attention' : 'critical';

  factors.sort((a, b) => a.points - b.points);
  return { overall, testing: t, configuration: c, security: sec, grade, state, factors };
}
