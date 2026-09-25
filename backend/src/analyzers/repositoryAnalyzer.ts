import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';
import { readFileSafe, parseJsonSafe, fileExists, relativePath, repoName } from '../utils/security';
import type {
  RepositoryProfile,
  Language,
  PackageManager,
  TestFramework,
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

/** Detect language from the presence of source files. */
function detectLanguage(sourceFiles: string[]): Language {
  let js = 0, ts = 0, py = 0, java = 0, go = 0, rs = 0, rb = 0, php = 0, cpp = 0;
  for (const f of sourceFiles) {
    if (f.endsWith('.ts') || f.endsWith('.tsx')) ts++;
    else if (f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.mjs')) js++;
    else if (f.endsWith('.py')) py++;
    else if (f.endsWith('.java')) java++;
    else if (f.endsWith('.go')) go++;
    else if (f.endsWith('.rs')) rs++;
    else if (f.endsWith('.rb')) rb++;
    else if (f.endsWith('.php')) php++;
    else if (f.endsWith('.cpp') || f.endsWith('.c')) cpp++;
  }

  const counts = { typescript: ts, javascript: js, python: py, java, go, rust: rs, ruby: rb, php, 'c++': cpp };
  let maxLang: Language = 'unknown';
  let maxCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang as Language;
    }
  }

  if (maxLang === 'typescript' && js > 0) return 'mixed'; // backwards compatibility
  return maxLang;
}

/** Detect package manager from lockfile or config presence. */
function detectPackageManager(repoPath: string): PackageManager {
  if (fileExists(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(repoPath, 'yarn.lock'))) return 'yarn';
  if (fileExists(path.join(repoPath, 'package-lock.json'))) return 'npm';
  if (fileExists(path.join(repoPath, 'requirements.txt'))) return 'pip';
  if (fileExists(path.join(repoPath, 'poetry.lock')) || fileExists(path.join(repoPath, 'pyproject.toml'))) return 'poetry';
  if (fileExists(path.join(repoPath, 'pom.xml'))) return 'maven';
  if (fileExists(path.join(repoPath, 'build.gradle'))) return 'gradle';
  if (fileExists(path.join(repoPath, 'Cargo.toml'))) return 'cargo';
  if (fileExists(path.join(repoPath, 'go.mod'))) return 'go-modules';
  if (fileExists(path.join(repoPath, 'Gemfile'))) return 'bundler';
  if (fileExists(path.join(repoPath, 'composer.json'))) return 'composer';
  return 'unknown';
}

/** Detect test frameworks from devDependencies and config files. */
function detectTestFrameworks(
  devDeps: Record<string, string>,
  configFiles: string[],
): TestFramework[] {
  const found = new Set<TestFramework>();
  const allKeys = Object.keys(devDeps).map((k) => k.toLowerCase());
  const configNames = configFiles.map((f) => path.basename(f).toLowerCase());

  // JS/TS
  if (allKeys.some((k) => k === 'jest' || k.startsWith('@jest/'))) found.add('jest');
  if (allKeys.some((k) => k === 'vitest')) found.add('vitest');
  if (allKeys.some((k) => k === 'mocha' || k === '@types/mocha')) found.add('mocha');
  if (allKeys.some((k) => k === 'jasmine' || k === 'jasmine-core')) found.add('jasmine');
  if (allKeys.some((k) => k === 'ava')) found.add('ava');

  // Fallback config files for all languages
  if (configNames.some((n) => n.startsWith('jest.config'))) found.add('jest');
  if (configNames.some((n) => n.startsWith('vitest.config'))) found.add('vitest');
  if (configNames.some((n) => n.startsWith('.mocharc'))) found.add('mocha');
  
  if (configNames.some((n) => n.includes('pytest'))) found.add('pytest');
  if (configNames.some((n) => n.includes('pom.xml') || n.includes('build.gradle'))) found.add('junit'); // simple assumption for Java
  if (configNames.some((n) => n === 'cargo.toml')) found.add('cargo-test');
  if (configNames.some((n) => n === 'go.mod')) found.add('go-test');
  if (configNames.some((n) => n === 'composer.json')) found.add('phpunit');
  if (configNames.some((n) => n === 'gemfile')) found.add('rspec');

  return Array.from(found);
}

/** Detect the primary framework from dependencies. */
function detectFramework(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): string | undefined {
  const all = { ...deps, ...devDeps };
  const keys = Object.keys(all).map((k) => k.toLowerCase());

  if (keys.includes('next')) return 'Next.js';
  if (keys.includes('nuxt') || keys.includes('nuxt3')) return 'Nuxt.js';
  if (keys.includes('remix')) return 'Remix';
  if (keys.includes('@nestjs/core')) return 'NestJS';
  if (keys.includes('express')) return 'Express';
  if (keys.includes('fastify')) return 'Fastify';
  if (keys.includes('koa')) return 'Koa';
  if (keys.includes('hapi') || keys.includes('@hapi/hapi')) return 'Hapi';
  if (keys.includes('react') && keys.includes('vite')) return 'React + Vite';
  if (keys.includes('react')) return 'React';
  if (keys.includes('vue')) return 'Vue';
  if (keys.includes('svelte')) return 'Svelte';
  if (keys.includes('@angular/core')) return 'Angular';
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

  // ── 2. Test files (subset of source files matching test patterns) ──────────
  const testFilesSet = await fg(TEST_PATTERNS, {
    cwd: repoPath,
    ignore: IGNORE_DIRS,
    absolute: false,
    followSymbolicLinks: false,
  });
  const testFilesNorm = new Set(testFilesSet.map((f) => f.replace(/\\/g, '/')));

  const pureSourceFiles = allSourceFiles.filter((f) => !testFilesNorm.has(f.replace(/\\/g, '/')));

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
  const packageManager = detectPackageManager(repoPath);
  const testFrameworks = detectTestFrameworks(devDependencies, configFiles);
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
    packageManager,
    framework,
    testFrameworks,
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
    testFiles: Array.from(testFilesNorm),
    configFiles,
    entryPoints,
    hasTypes,
  };
}
