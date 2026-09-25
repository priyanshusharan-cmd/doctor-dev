// ─── Core domain types for the Doctor Dev backend ────────────────────────────

// ─── Analysis ─────────────────────────────────────────────────────────────────

export type AnalysisStatus =
  | 'pending'
  | 'scanning'
  | 'analyzing_code'
  | 'analyzing_tests'
  | 'analyzing_config'
  | 'prioritizing'
  | 'complete'
  | 'error';

export interface Analysis {
  id: string;
  status: AnalysisStatus;
  statusLabel: string;
  repositoryPath: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  result?: AnalysisResult;
}

// ─── Repository Profile ───────────────────────────────────────────────────────

export type Language = 'typescript' | 'javascript' | 'mixed' | 'python' | 'java' | 'go' | 'rust' | 'ruby' | 'php' | 'c++' | 'unknown';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'maven' | 'gradle' | 'cargo' | 'go-modules' | 'bundler' | 'composer' | 'unknown';
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'jasmine' | 'ava' | 'pytest' | 'unittest' | 'junit' | 'cargo-test' | 'go-test' | 'rspec' | 'phpunit' | 'unknown';

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

// ─── Code Symbol ─────────────────────────────────────────────────────────────

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'arrow_function'
  | 'export'
  | 'route_handler'
  | 'middleware'
  | 'controller'
  | 'service'
  | 'utility';

export type SymbolImportance = 'critical' | 'high' | 'medium' | 'low';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
  importance: SymbolImportance;
  importanceReasons: string[];
  isAsync: boolean;
  paramCount: number;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export interface RouteInfo {
  method: string;
  path: string;
  filePath: string;
  handlerName?: string;
  line: number;
}

// ─── Test Profile ─────────────────────────────────────────────────────────────

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
  coveredFiles: Set<string>;
  detectedTestScript?: string;
}

// ─── Test Mapping ─────────────────────────────────────────────────────────────

export type CoverageStatus = 'covered' | 'partial' | 'none';

export interface TestMapping {
  sourceFile: string;
  sourceSymbol?: string;
  relatedTests: string[];
  coverageStatus: CoverageStatus;
  /** 0–1 confidence that the mapping is correct */
  confidence: number;
}

// ─── Testing Gaps ─────────────────────────────────────────────────────────────

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
  /** 0–1 confidence */
  confidence: number;
  category: GapCategory;
  title: string;
  description: string;
  /** Relative path */
  filePath: string;
  symbolName?: string;
  lineStart?: number;
  /** Why is this severity assigned? */
  reason: string;
  /** Concrete evidence from source code */
  evidence: string[];
  existingTests: string[];
  recommendedTests: string[];
}

// ─── Generated Test ───────────────────────────────────────────────────────────

export interface GeneratedTest {
  gapId: string;
  filePath: string;
  content: string;
  targetFile: string;
  targetSymbol?: string;
  framework: TestFramework | string;
}

// ─── Test Run ─────────────────────────────────────────────────────────────────

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

// ─── Config Issues ────────────────────────────────────────────────────────────

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
  /** 0–1 */
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
  /** Values are NEVER stored — only name + secret flag */
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

// ─── Health Score ─────────────────────────────────────────────────────────────

export type HealthState = 'healthy' | 'needs_attention' | 'critical';

export interface HealthScore {
  overall: number;
  testing: number;
  configuration: number;
  security: number;
  state: HealthState;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

// ─── Priority Finding ─────────────────────────────────────────────────────────

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

// ─── Full Result ──────────────────────────────────────────────────────────────

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

// ─── API ──────────────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  repositoryPath: string;
  runTests?: boolean;
  generateTests?: boolean;
}

export interface ApiError {
  error: string;
  detail?: string;
}
