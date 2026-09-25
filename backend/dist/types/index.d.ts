export type AnalysisStatus = 'pending' | 'scanning' | 'analyzing_code' | 'analyzing_tests' | 'analyzing_config' | 'prioritizing' | 'complete' | 'error';
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
export type Language = 'typescript' | 'javascript' | 'mixed' | 'python' | 'java' | 'go' | 'rust' | 'ruby' | 'php' | 'c++' | 'unknown';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'maven' | 'gradle' | 'cargo' | 'go-modules' | 'bundler' | 'composer' | 'unknown';
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'jasmine' | 'ava' | 'node-test' | 'pytest' | 'unittest' | 'junit' | 'cargo-test' | 'go-test' | 'rspec' | 'phpunit' | 'unknown';
export interface TestFrameworkEvidence {
    framework: TestFramework | string;
    confidence: number;
    evidence: string[];
    executionModel: 'cli_runner' | 'custom_script' | 'builtin_runner' | 'unknown';
}
export interface RepositoryProfile {
    name: string;
    description?: string;
    language: Language;
    primaryEcosystem?: string;
    packageManager: PackageManager;
    framework?: string;
    testFrameworks: TestFramework[];
    testFrameworkEvidence?: TestFrameworkEvidence;
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
    fixtureFiles?: string[];
    helperFiles?: string[];
    benchmarkFiles?: string[];
    configFiles: string[];
    entryPoints: string[];
    hasTypes: boolean;
}
export type SymbolKind = 'function' | 'class' | 'method' | 'arrow_function' | 'export' | 'route_handler' | 'middleware' | 'controller' | 'service' | 'utility';
export type SymbolImportance = 'critical' | 'high' | 'medium' | 'low';
export type SourceType = 'production' | 'examples' | 'benchmarks' | 'fixtures' | 'tests' | 'documentation' | 'generated' | 'build' | 'configuration';
export interface CodeSymbol {
    name: string;
    kind: SymbolKind;
    filePath: string;
    sourceType: SourceType;
    lineStart: number;
    lineEnd: number;
    isExported: boolean;
    importance: SymbolImportance;
    importanceReasons: string[];
    isAsync: boolean;
    paramCount: number;
}
export interface RouteInfo {
    method: string;
    path: string;
    filePath: string;
    sourceType: SourceType;
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
    inheritedFramework?: boolean;
}
export interface TestProfile {
    totalTestFiles: number;
    totalTestCount: number;
    totalTestSuites?: number;
    suites: TestSuite[];
    classifiedTestFiles?: {
        filePath: string;
        category: 'unit' | 'integration' | 'fixture' | 'helper' | 'benchmark' | 'example';
        testCount: number;
    }[];
    coveredFiles: Set<string>;
    detectedTestScript?: string;
    coverage: CoverageInfo;
    testFrameworkEvidence?: TestFrameworkEvidence;
}
export type CoverageStatus = 'DIRECTLY_TESTED' | 'INDIRECTLY_TESTED' | 'PARTIALLY_TESTED' | 'NOT_ENOUGH_EVIDENCE' | 'NOT_TESTED';
export interface TestMapping {
    sourceFile: string;
    sourceSymbol?: string;
    relatedTests: string[];
    coverageStatus: CoverageStatus;
    /** 0–1 confidence that the mapping is correct */
    confidence: number;
    evidence: string[];
}
export type GlobalCoverageStatus = 'ACTUAL_COVERAGE' | 'EVIDENCE_BASED' | 'UNAVAILABLE';
export interface CoverageInfo {
    status: GlobalCoverageStatus;
    percentage?: number;
    reason: string;
}
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GapCategory = 'no_test' | 'missing_error_test' | 'missing_edge_case' | 'missing_auth_test' | 'missing_integration_test' | 'partial_test';
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
    whyDoctorDevBelievesThis?: string;
    whyUncertain?: string;
}
export interface GeneratedTest {
    gapId: string;
    filePath: string;
    content: string;
    targetFile: string;
    targetSymbol?: string;
    framework: TestFramework | string;
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
export type IssueCategory = 'environment' | 'runtime' | 'package' | 'ports' | 'docker' | 'ci' | 'documentation' | 'scripts' | 'security';
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
    whyDoctorDevBelievesThis?: string;
    whyUncertain?: string;
}
export type EnvVarCategory = 'APPLICATION' | 'DATABASE' | 'SERVICE' | 'CI_CD' | 'OS_SHELL' | 'NODE_RUNTIME' | 'TEST' | 'BENCHMARK' | 'TOOLING' | 'UNKNOWN';
export interface EnvVarInfo {
    name: string;
    category?: EnvVarCategory;
    definedIn: string[];
    usedIn: string[];
    hasDefault: boolean;
    /** Values are NEVER stored — only name + secret flag */
    isSecret: boolean;
}
export type PortRole = 'server_listen' | 'client_dest' | 'docker_expose' | 'env_fallback' | 'doc_reference' | 'unknown';
export interface PortMention {
    port: number;
    filePath: string;
    context: string;
    line: number;
    role?: PortRole;
    isServerListen?: boolean;
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
export interface AnalyzeRequest {
    repositoryPath: string;
    runTests?: boolean;
    generateTests?: boolean;
}
export interface ApiError {
    error: string;
    detail?: string;
}
