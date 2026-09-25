// Frontend types — mirrors backend/src/types/index.ts exactly.

export type AnalysisStatus =
  | 'pending'
  | 'scanning'
  | 'analyzing_code'
  | 'analyzing_tests'
  | 'analyzing_config'
  | 'prioritizing'
  | 'complete'
  | 'error';

export interface AnalysisPoll {
  id: string;
  status: AnalysisStatus;
  statusLabel: string;
  repositoryPath: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export type Language = 'typescript' | 'javascript' | 'mixed' | 'unknown';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'unknown';
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'jasmine' | 'ava' | 'unknown';

export interface RepositoryProfile {
  name: string;
  description?: string;
  language: Language;
  packageManager: PackageManager;
  framework?: string;
  testFrameworks: TestFramework[];
  nodeVersion?: string;
  isMonorepo: boolean;
  workspaces: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  isGitRepo: boolean;
  gitRemote?: string;
  totalFiles: number;
  sourceFiles: string[];
  testFiles: string[];
  configFiles: string[];
  entryPoints: string[];
  hasTypes: boolean;
}

export interface CodeSymbol {
  name: string;
  kind: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
  importance: 'critical' | 'high' | 'medium' | 'low';
  importanceReasons: string[];
  isAsync: boolean;
  paramCount: number;
}

export interface RouteInfo {
  method: string;
  path: string;
  filePath: string;
  handlerName?: string;
  line: number;
}

export interface TestSuite {
  filePath: string;
  framework: TestFramework;
  testCount: number;
  describeBlocks: string[];
  itBlocks: string[];
  importsUnder: string[];
}

export interface TestProfile {
  totalTestFiles: number;
  totalTestCount: number;
  suites: TestSuite[];
  coveredFiles: string[];
  detectedTestScript?: string;
}

export type CoverageStatus = 'covered' | 'partial' | 'none';

export interface TestMapping {
  sourceFile: string;
  sourceSymbol?: string;
  relatedTests: string[];
  coverageStatus: CoverageStatus;
  confidence: number;
}

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GapCategory =
  | 'no_test'
  | 'missing_error_test'
  | 'missing_edge_case'
  | 'missing_auth_test'
  | 'missing_integration_test'
  | 'partial_test';

export interface TestGap {
  id: string;
  severity: GapSeverity;
  confidence: number;
  category: GapCategory;
  title: string;
  description: string;
  filePath: string;
  symbolName?: string;
  lineStart?: number;
  reason: string;
  evidence: string[];
  existingTests: string[];
  recommendedTests: string[];
}

export interface GeneratedTest {
  gapId: string;
  filePath: string;
  content: string;
  targetFile: string;
  targetSymbol?: string;
  framework: string;
}

export type TestRunStatus = 'not_run' | 'running' | 'passed' | 'failed' | 'error';

export interface TestFailure {
  name: string;
  error: string;
  file?: string;
}

export interface TestRunResult {
  status: TestRunStatus;
  command: string;
  exitCode: number;
  duration: number;
  testsRun: number;
  passed: number;
  failed: number;
  skipped: number;
  stdout: string;
  stderr: string;
  failures: TestFailure[];
}

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueCategory =
  | 'environment'
  | 'runtime'
  | 'package'
  | 'ports'
  | 'docker'
  | 'ci'
  | 'documentation'
  | 'scripts'
  | 'security';

export interface ConfigIssue {
  id: string;
  severity: IssueSeverity;
  confidence: number;
  category: IssueCategory;
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  evidence: string[];
  recommendedFix: string;
  affectedFiles?: string[];
}

export interface EnvVarInfo {
  name: string;
  definedIn: string[];
  usedIn: string[];
  hasDefault: boolean;
  isSecret: boolean;
}

export interface PortMention {
  port: number;
  filePath: string;
  context: string;
  line: number;
}

export interface ConfigHealth {
  issues: ConfigIssue[];
  envVars: EnvVarInfo[];
  portMentions: PortMention[];
  dockerfiles: string[];
  ciFiles: string[];
  hasEnvExample: boolean;
  hasDotenv: boolean;
  summary: string;
}

export type HealthState = 'healthy' | 'needs_attention' | 'critical';

export interface HealthScore {
  overall: number;
  testing: number;
  configuration: number;
  security: number;
  state: HealthState;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export type FindingLevel = 'critical' | 'high' | 'medium' | 'low';

export interface PriorityFinding {
  id: string;
  level: FindingLevel;
  title: string;
  description: string;
  category: 'testing' | 'configuration' | 'security' | 'reliability';
  recommendation: string;
  estimatedImpact: string;
  sourceGapIds: string[];
  sourceIssueIds: string[];
}

export interface AnalysisResult {
  analysisId: string;
  repositoryProfile: RepositoryProfile;
  symbols: CodeSymbol[];
  routes: RouteInfo[];
  testProfile: TestProfile;
  testMappings: TestMapping[];
  testGaps: TestGap[];
  generatedTests: GeneratedTest[];
  configHealth: ConfigHealth;
  priorityFindings: PriorityFinding[];
  healthScore: HealthScore;
  testRunResult?: TestRunResult;
  scannedAt: string;
}

// UI
export type ActiveTab = 'overview' | 'testing' | 'configuration' | 'validation' | 'report';
