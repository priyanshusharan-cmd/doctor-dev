import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';
import { readFileSafe, parseJsonSafe, fileExists, relativePath, repoName } from '../utils/security';
import type {
  RepositoryProfile,
  Language,
  PackageManager,
  TestFramework,
  TestFrameworkEvidence,
} from '../types';

// ─── Patterns ─────────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'java', 'go', 'rs', 'rb', 'php', 'cpp', 'c', 'h', 'hpp'];
const TEST_PATTERNS = [
  '**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx',
  '**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js', '**/*.spec.jsx',
  '**/__tests__/**/*.{ts,tsx,js,jsx}',
  '**/test/**/*.{ts,tsx,js,jsx}',
  '**/tests/**/*.{ts,tsx,js,jsx}',
  '**/*_test.py', '**/test_*.py',
  '**/*Test.java', '**/*Tests.java',
  '**/*_test.go',
  '**/tests/**/*.rs',
  '**/*_spec.rb',
  '**/*Test.php',
];

const CONFIG_FILE_NAMES = [
  'package.json', 'tsconfig.json', 'tsconfig.*.json',
  '.env.example', '.env.sample', '.env.template',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github/workflows/*.yml', '.github/workflows/*.yaml',
  '.gitlab-ci.yml', '.circleci/config.yml',
  'jest.config.*', 'vitest.config.*', '.mocharc.*',
  'vite.config.*', 'webpack.config.*', 'rollup.config.*',
  '.eslintrc*', '.prettierrc*', '.babelrc*',
  'README.md', 'README.MD', 'readme.md',
  'requirements.txt', 'pyproject.toml', 'Pipfile',
  'pom.xml', 'build.gradle',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'composer.json',
];

const IGNORE_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/.turbo/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/venv/**',
  '**/.venv/**',
  '**/target/**',
  '**/vendor/**',
];

/** Detect primary ecosystem from root files and language presence */
export function detectPrimaryEcosystem(repoPath: string, language: Language): string {
  // If package.json exists, ecosystem is always Node
  if (fileExists(path.join(repoPath, 'package.json'))) return 'node';

  // Node runtime or JS/TS repository markers
  if (
    fileExists(path.join(repoPath, '.npmrc')) ||
    fileExists(path.join(repoPath, 'node.gyp')) ||
    fileExists(path.join(repoPath, 'common.gypi')) ||
    language === 'typescript' ||
    language === 'javascript' ||
    language === 'mixed'
  ) {
    return 'node';
  }

  if (fileExists(path.join(repoPath, 'Cargo.toml')) && (language === 'rust' || language === 'unknown')) return 'rust';
  if (fileExists(path.join(repoPath, 'go.mod')) && (language === 'go' || language === 'unknown')) return 'go';
  if ((fileExists(path.join(repoPath, 'pom.xml')) || fileExists(path.join(repoPath, 'build.gradle'))) && (language === 'java' || language === 'unknown')) return 'java';
  if (fileExists(path.join(repoPath, 'composer.json')) && (language === 'php' || language === 'unknown')) return 'php';
  if (fileExists(path.join(repoPath, 'Gemfile')) && (language === 'ruby' || language === 'unknown')) return 'ruby';

  // Python: Only classify as Python if language is python or python manifest exists and not C++/Node
  if (
    language === 'python' ||
    ((fileExists(path.join(repoPath, 'pyproject.toml')) || fileExists(path.join(repoPath, 'requirements.txt')) || fileExists(path.join(repoPath, 'Pipfile'))) &&
      language !== 'c++' &&
      language !== 'rust' &&
      language !== 'go')
  ) {
    return 'python';
  }

  if (language === 'rust') return 'rust';
  if (language === 'go') return 'go';
  if (language === 'java') return 'java';
  return 'unknown';
}

/** Detect language from the presence of source files. Exclude build/tools/benchmarks from core ratio. */
function detectLanguage(sourceFiles: string[]): Language {
  let js = 0, ts = 0, py = 0, java = 0, go = 0, rs = 0, rb = 0, php = 0, cpp = 0;
  for (const f of sourceFiles) {
    const norm = f.replace(/\\/g, '/').toLowerCase();
    // De-prioritize auxiliary scripts in tooling/build/benchmarks when counting primary language
    const isAuxiliary = /(^|\/)(tools?|scripts?|benchmarks?|bench|fixtures?)\//.test(norm);
    const weight = isAuxiliary ? 0.2 : 1.0;

    if (f.endsWith('.ts') || f.endsWith('.tsx')) ts += weight;
    else if (f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.mjs')) js += weight;
    else if (f.endsWith('.py')) py += weight;
    else if (f.endsWith('.java')) java += weight;
    else if (f.endsWith('.go')) go += weight;
    else if (f.endsWith('.rs')) rs += weight;
    else if (f.endsWith('.rb')) rb += weight;
    else if (f.endsWith('.php')) php += weight;
    else if (f.endsWith('.cpp') || f.endsWith('.c')) cpp += weight;
  }

  const counts: Record<string, number> = { typescript: ts, javascript: js, python: py, java, go, rust: rs, ruby: rb, php, 'c++': cpp };
  let maxLang: Language = 'unknown';
  let maxCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang as Language;
    }
  }

  if (maxLang === 'typescript' && js > 0) return 'mixed';
  return maxLang;
}

/** Detect package manager from ecosystem, lockfiles, and package manifests. Never pick pip/poetry for Node! */
function detectPackageManager(
  repoPath: string,
  primaryEcosystem: string,
  pkg?: { packageManager?: string },
  language?: Language,
): PackageManager {
  // If primary ecosystem is Node or JS/TS files exist or Node markers exist, prioritize JS package managers strictly
  const isNode =
    primaryEcosystem === 'node' ||
    fileExists(path.join(repoPath, 'package.json')) ||
    fileExists(path.join(repoPath, '.npmrc')) ||
    fileExists(path.join(repoPath, 'node.gyp')) ||
    language === 'javascript' ||
    language === 'typescript' ||
    language === 'mixed';

  if (isNode) {
    if (fileExists(path.join(repoPath, 'bun.lockb')) || fileExists(path.join(repoPath, 'bun.lock'))) return 'bun';
    if (fileExists(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fileExists(path.join(repoPath, 'yarn.lock'))) return 'yarn';
    if (fileExists(path.join(repoPath, 'package-lock.json'))) return 'npm';
    if (pkg?.packageManager) {
      if (pkg.packageManager.startsWith('bun')) return 'bun';
      if (pkg.packageManager.startsWith('pnpm')) return 'pnpm';
      if (pkg.packageManager.startsWith('yarn')) return 'yarn';
      if (pkg.packageManager.startsWith('npm')) return 'npm';
    }
    return 'npm'; // Standard fallback for Node projects
  }

  // Rust
  if (primaryEcosystem === 'rust' || fileExists(path.join(repoPath, 'Cargo.toml'))) return 'cargo';

  // Go
  if (primaryEcosystem === 'go' || fileExists(path.join(repoPath, 'go.mod'))) return 'go-modules';

  // Java
  if (fileExists(path.join(repoPath, 'pom.xml'))) return 'maven';
  if (fileExists(path.join(repoPath, 'build.gradle'))) return 'gradle';

  // Python: strictly only if primary ecosystem is Python
  if (primaryEcosystem === 'python') {
    if (fileExists(path.join(repoPath, 'poetry.lock'))) return 'poetry';
    const pyproject = readFileSafe(path.join(repoPath, 'pyproject.toml'));
    if (pyproject && pyproject.includes('[tool.poetry]')) return 'poetry';
    if (fileExists(path.join(repoPath, 'Pipfile'))) return 'pip';
    return 'pip';
  }

  if (fileExists(path.join(repoPath, 'Gemfile'))) return 'bundler';
  if (fileExists(path.join(repoPath, 'composer.json'))) return 'composer';
  return 'unknown';
}

/**
 * Detect repository-level test execution model with confidence and evidence.
 * Inspects package.json scripts, configs, test runner CLIs, dependencies, and directory conventions.
 */
function detectTestExecutionModel(
  repoPath: string,
  scripts: Record<string, string>,
  devDeps: Record<string, string>,
  configFiles: string[],
): { frameworks: TestFramework[]; evidence: TestFrameworkEvidence } {
  const allScripts = Object.entries(scripts).map(([k, v]) => `${k}: ${v}`.toLowerCase());
  const devDepKeys = Object.keys(devDeps).map((k) => k.toLowerCase());
  const configNames = configFiles.map((f) => path.basename(f).toLowerCase());

  const evidenceList: string[] = [];
  let detectedFramework: TestFramework = 'unknown';
  let confidence = 0.5;
  let executionModel: TestFrameworkEvidence['executionModel'] = 'unknown';

  // 1. Check package.json scripts (strongest direct evidence of execution model)
  const testScript = scripts['test'] ?? scripts['test:unit'] ?? scripts['test:all'] ?? '';
  const testScriptLower = testScript.toLowerCase();

  if (testScriptLower.includes('mocha') || allScripts.some((s) => s.includes('mocha '))) {
    detectedFramework = 'mocha';
    confidence = 0.95;
    executionModel = 'cli_runner';
    evidenceList.push(`Test script invokes Mocha CLI: "${testScript || 'mocha'}"`);
  } else if (testScriptLower.includes('vitest') || allScripts.some((s) => s.includes('vitest'))) {
    detectedFramework = 'vitest';
    confidence = 0.95;
    executionModel = 'cli_runner';
    evidenceList.push(`Test script invokes Vitest CLI: "${testScript}"`);
  } else if (testScriptLower.includes('jest') || allScripts.some((s) => s.includes('jest'))) {
    detectedFramework = 'jest';
    confidence = 0.95;
    executionModel = 'cli_runner';
    evidenceList.push(`Test script invokes Jest CLI: "${testScript}"`);
  } else if (testScriptLower.includes('node --test') || testScriptLower.includes('node test/')) {
    detectedFramework = 'node-test';
    confidence = 0.95;
    executionModel = 'builtin_runner';
    evidenceList.push(`Test script invokes Node built-in test runner: "${testScript}"`);
  } else if (testScriptLower.includes('pytest')) {
    detectedFramework = 'pytest';
    confidence = 0.95;
    executionModel = 'cli_runner';
    evidenceList.push(`Test script invokes pytest: "${testScript}"`);
  } else if (testScriptLower.includes('tools/test.py') || allScripts.some((s) => s.includes('tools/test.py'))) {
    detectedFramework = 'node-test';
    confidence = 0.95;
    executionModel = 'custom_script';
    evidenceList.push(`Test script invokes Node test harness runner: "${testScript}"`);
  }

  // 2. Check repository directory & harness conventions
  if (confidence < 0.9) {
    const hasParallel = fs.existsSync(path.join(repoPath, 'test', 'parallel'));
    const hasSequential = fs.existsSync(path.join(repoPath, 'test', 'sequential'));
    const hasTestPy = fs.existsSync(path.join(repoPath, 'tools', 'test.py'));
    const hasNodeGyp = fs.existsSync(path.join(repoPath, 'node.gyp'));

    if ((hasParallel || hasSequential) && (hasTestPy || hasNodeGyp)) {
      detectedFramework = 'node-test';
      confidence = 0.95;
      executionModel = 'builtin_runner';
      evidenceList.push('Repository organizes test suites in test/parallel and test/sequential run via Node core test harness');
    } else if (hasParallel || hasSequential) {
      detectedFramework = 'node-test';
      confidence = 0.9;
      executionModel = 'builtin_runner';
      evidenceList.push('Found Node test runner directory conventions (test/parallel, test/sequential)');
    } else if (fs.existsSync(path.join(repoPath, 'conftest.py')) || fs.existsSync(path.join(repoPath, 'tests', 'conftest.py'))) {
      detectedFramework = 'pytest';
      confidence = 0.9;
      executionModel = 'cli_runner';
      evidenceList.push('Found pytest configuration fixture (conftest.py)');
    }
  }

  // 3. Check config files if not already high confidence
  if (confidence < 0.9) {
    if (configNames.some((n) => n.startsWith('.mocharc') || n === 'mocha.opts')) {
      detectedFramework = 'mocha';
      confidence = 0.9;
      executionModel = 'cli_runner';
      evidenceList.push('Found Mocha configuration file (.mocharc)');
    } else if (configNames.some((n) => n.startsWith('vitest.config'))) {
      detectedFramework = 'vitest';
      confidence = 0.9;
      executionModel = 'cli_runner';
      evidenceList.push('Found Vitest configuration file (vitest.config)');
    } else if (configNames.some((n) => n.startsWith('jest.config'))) {
      detectedFramework = 'jest';
      confidence = 0.9;
      executionModel = 'cli_runner';
      evidenceList.push('Found Jest configuration file (jest.config)');
    } else if (configNames.some((n) => n === 'pytest.ini' || n === 'setup.cfg')) {
      detectedFramework = 'pytest';
      confidence = 0.85;
      executionModel = 'cli_runner';
      evidenceList.push('Found Pytest configuration file');
    } else if (configNames.some((n) => n === 'cargo.toml')) {
      detectedFramework = 'cargo-test';
      confidence = 0.85;
      executionModel = 'builtin_runner';
      evidenceList.push('Rust repository using standard cargo test');
    } else if (configNames.some((n) => n === 'go.mod')) {
      detectedFramework = 'go-test';
      confidence = 0.85;
      executionModel = 'builtin_runner';
      evidenceList.push('Go repository using standard go test');
    }
  }

  // 4. Fallback to installed devDependencies
  if (confidence < 0.8) {
    if (devDepKeys.includes('mocha') || devDepKeys.includes('@types/mocha')) {
      detectedFramework = 'mocha';
      confidence = 0.75;
      executionModel = 'cli_runner';
      evidenceList.push('Mocha installed in devDependencies');
    } else if (devDepKeys.includes('vitest')) {
      detectedFramework = 'vitest';
      confidence = 0.75;
      executionModel = 'cli_runner';
      evidenceList.push('Vitest installed in devDependencies');
    } else if (devDepKeys.includes('jest') || devDepKeys.some((k) => k.startsWith('@jest/'))) {
      detectedFramework = 'jest';
      confidence = 0.75;
      executionModel = 'cli_runner';
      evidenceList.push('Jest installed in devDependencies');
    }
  }

  // 5. Fallback to Makefile targets if present
  if (confidence < 0.7) {
    const makefile = readFileSafe(path.join(repoPath, 'Makefile')) || readFileSafe(path.join(repoPath, 'BSDmakefile'));
    if (makefile) {
      if (makefile.includes('tools/test.py') || makefile.includes('node --test')) {
        detectedFramework = 'node-test';
        confidence = 0.85;
        executionModel = 'custom_script';
        evidenceList.push('Makefile defines test targets invoking Node test harness');
      } else if (makefile.includes('mocha')) {
        detectedFramework = 'mocha';
        confidence = 0.8;
        executionModel = 'cli_runner';
        evidenceList.push('Makefile defines test targets invoking Mocha');
      } else if (makefile.includes('pytest')) {
        detectedFramework = 'pytest';
        confidence = 0.8;
        executionModel = 'cli_runner';
        evidenceList.push('Makefile defines test targets invoking pytest');
      }
    }
  }

  if (evidenceList.length === 0) {
    evidenceList.push('No explicit test runner script or configuration detected');
  }

  const frameworks: TestFramework[] = detectedFramework !== 'unknown' ? [detectedFramework] : [];

  return {
    frameworks,
    evidence: {
      framework: detectedFramework,
      confidence,
      evidence: evidenceList,
      executionModel,
    },
  };
}

/** Detect the primary framework from dependencies. */
function detectFramework(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): string | undefined {
  const prodKeys = Object.keys(deps).map((k) => k.toLowerCase());
  const allKeys = Object.keys({ ...deps, ...devDeps }).map((k) => k.toLowerCase());

  // Backend frameworks must be in production dependencies
  if (prodKeys.includes('next')) return 'Next.js';
  if (prodKeys.includes('nuxt') || prodKeys.includes('nuxt3')) return 'Nuxt.js';
  if (prodKeys.includes('remix')) return 'Remix';
  if (prodKeys.includes('@nestjs/core')) return 'NestJS';
  if (prodKeys.includes('express')) return 'Express';
  if (prodKeys.includes('fastify')) return 'Fastify';
  if (prodKeys.includes('koa')) return 'Koa';
  if (prodKeys.includes('hapi') || prodKeys.includes('@hapi/hapi')) return 'Hapi';

  // Frontend frameworks can often be devDependencies (static sites, vite, etc.)
  if (allKeys.includes('next')) return 'Next.js';
  if (allKeys.includes('nuxt') || allKeys.includes('nuxt3')) return 'Nuxt.js';
  if (allKeys.includes('remix')) return 'Remix';
  if (allKeys.includes('react') && allKeys.includes('vite')) return 'React + Vite';
  if (allKeys.includes('react')) return 'React';
  if (allKeys.includes('vue')) return 'Vue';
  if (allKeys.includes('svelte')) return 'Svelte';
  if (allKeys.includes('@angular/core')) return 'Angular';

  return undefined;
}

/** Detect git remote from .git/config. */
function detectGitRemote(repoPath: string): string | undefined {
  const gitConfig = readFileSafe(path.join(repoPath, '.git', 'config'));
  if (!gitConfig) return undefined;
  const match = gitConfig.match(/url\s*=\s*(.+)/);
  return match?.[1]?.trim();
}

/** Find likely entry point files. */
function findEntryPoints(
  repoPath: string,
  scripts: Record<string, string>,
  sourceFiles: string[],
): string[] {
  const entries: string[] = [];

  // From package.json "main" or "module"
  const pkgPath = path.join(repoPath, 'package.json');
  const pkg = parseJsonSafe<Record<string, unknown>>(readFileSafe(pkgPath) ?? '');
  if (pkg?.main && typeof pkg.main === 'string') {
    entries.push(relativePath(repoPath, path.resolve(repoPath, pkg.main)));
  }
  if (pkg?.module && typeof pkg.module === 'string') {
    entries.push(relativePath(repoPath, path.resolve(repoPath, pkg.module as string)));
  }

  // Common entry file names
  const commonEntries = ['src/index.ts', 'src/index.js', 'src/server.ts', 'src/server.js',
    'src/app.ts', 'src/app.js', 'index.ts', 'index.js', 'server.ts', 'server.js', 'app.ts', 'app.js'];
  for (const e of commonEntries) {
    if (fileExists(path.join(repoPath, e))) entries.push(e);
  }

  return [...new Set(entries)].slice(0, 5);
}

/**
 * Scan a repository directory and return its profile.
 * Never modifies the repository — read-only.
 */
export async function analyzeRepository(repoPath: string): Promise<RepositoryProfile> {
  // ── 1. Source files ────────────────────────────────────────────────────────
  const sourceGlob = SOURCE_EXTENSIONS.map((ext) => `**/*.${ext}`);
  const allSourceFiles = await fg(sourceGlob, {
    cwd: repoPath,
    ignore: IGNORE_DIRS,
    absolute: false,
    followSymbolicLinks: false,
  });

  // ── 2. Test files, fixtures, helpers, benchmarks separation ──────────────
  const rawTestFiles = await fg(TEST_PATTERNS, {
    cwd: repoPath,
    ignore: IGNORE_DIRS,
    absolute: false,
    followSymbolicLinks: false,
  });

  const testFiles: string[] = [];
  const fixtureFiles: string[] = [];
  const helperFiles: string[] = [];
  const benchmarkFiles: string[] = [];
  const exampleFiles: string[] = [];

  for (const raw of rawTestFiles) {
    const norm = raw.replace(/\\/g, '/');
    const lower = norm.toLowerCase();
    if (/(^|\/)(fixtures?|__fixtures__|samples?|sandbox|mocks?|__mocks__|e2e)\//.test(lower)) {
      fixtureFiles.push(norm);
    } else if (/(^|\/)(common|helpers?|support)\//.test(lower)) {
      helperFiles.push(norm);
    } else if (/(^|\/)(benchmarks?|bench)\//.test(lower)) {
      benchmarkFiles.push(norm);
    } else if (/(^|\/)(examples?)\//.test(lower)) {
      exampleFiles.push(norm);
    } else {
      testFiles.push(norm);
    }
  }

  // Also aggressively find examples and sandbox folders that might not match TEST_PATTERNS
  for (const srcFile of allSourceFiles) {
    const norm = srcFile.replace(/\\/g, '/').toLowerCase();
    if (/(^|\/)(examples?|sandbox)\//.test(norm) && !exampleFiles.includes(srcFile.replace(/\\/g, '/'))) {
      exampleFiles.push(srcFile.replace(/\\/g, '/'));
    }
  }

  const nonProdFiles = new Set([
    ...testFiles,
    ...fixtureFiles,
    ...helperFiles,
    ...benchmarkFiles,
    ...exampleFiles,
  ]);
  const pureSourceFiles = allSourceFiles.filter((f) => !nonProdFiles.has(f.replace(/\\/g, '/')));

  // ── 3. Config files ────────────────────────────────────────────────────────
  const configFiles = await fg(CONFIG_FILE_NAMES, {
    cwd: repoPath,
    ignore: IGNORE_DIRS,
    absolute: false,
    followSymbolicLinks: false,
    dot: true,
  });

  // ── 4. package.json ────────────────────────────────────────────────────────
  interface PackageJson {
    name?: string;
    description?: string;
    version?: string;
    main?: string;
    module?: string;
    packageManager?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    engines?: { node?: string };
    workspaces?: string[] | { packages?: string[] };
  }

  const pkgContent = readFileSafe(path.join(repoPath, 'package.json'));
  const pkg = pkgContent ? parseJsonSafe<PackageJson>(pkgContent) : null;
  const dependencies: Record<string, string> = pkg?.dependencies ?? {};
  const devDependencies: Record<string, string> = pkg?.devDependencies ?? {};
  const scripts: Record<string, string> = pkg?.scripts ?? {};
  const nodeVersion = pkg?.engines?.node;

  // Workspaces / monorepo
  let workspaces: string[] = [];
  if (Array.isArray(pkg?.workspaces)) {
    workspaces = pkg.workspaces as string[];
  } else if (pkg?.workspaces && typeof pkg.workspaces === 'object') {
    workspaces = (pkg.workspaces as { packages?: string[] }).packages ?? [];
  }
  const isMonorepo = workspaces.length > 0
    || fileExists(path.join(repoPath, 'pnpm-workspace.yaml'))
    || fileExists(path.join(repoPath, 'lerna.json'));

  // ── 5. Derived attributes ──────────────────────────────────────────────────
  const language = detectLanguage(pureSourceFiles);
  const primaryEcosystem = detectPrimaryEcosystem(repoPath, language);
  const packageManager = detectPackageManager(repoPath, primaryEcosystem, pkg ?? undefined, language);
  const testModel = detectTestExecutionModel(repoPath, scripts, devDependencies, configFiles);
  const framework = detectFramework(dependencies, devDependencies);
  const isGitRepo = fileExists(path.join(repoPath, '.git'));
  const gitRemote = isGitRepo ? detectGitRemote(repoPath) : undefined;
  const hasTypes = fileExists(path.join(repoPath, 'tsconfig.json'))
    || Object.keys(devDependencies).some((d) => d === 'typescript');
  const entryPoints = findEntryPoints(repoPath, scripts, pureSourceFiles);

  // ── 6. Total file count (everything, for context) ─────────────────────────
  const allFiles = await fg('**', {
    cwd: repoPath,
    ignore: IGNORE_DIRS,
    absolute: false,
    followSymbolicLinks: false,
    dot: true,
  });

  return {
    name: pkg?.name ?? repoName(repoPath),
    description: pkg?.description,
    language,
    primaryEcosystem,
    packageManager,
    framework,
    testFrameworks: testModel.frameworks.length > 0 ? testModel.frameworks : ['unknown'],
    testFrameworkEvidence: testModel.evidence,
    nodeVersion,
    isMonorepo,
    workspaces,
    dependencies,
    devDependencies,
    scripts,
    isGitRepo,
    gitRemote,
    totalFiles: allFiles.length,
    sourceFiles: pureSourceFiles,
    testFiles,
    fixtureFiles,
    helperFiles,
    benchmarkFiles,
    configFiles,
    entryPoints,
    hasTypes,
  };
}
