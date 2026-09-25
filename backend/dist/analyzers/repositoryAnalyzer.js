"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRepository = analyzeRepository;
const path_1 = __importDefault(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const security_1 = require("../utils/security");
// ─── Patterns ─────────────────────────────────────────────────────────────────
const SOURCE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];
const TEST_PATTERNS = [
    '**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.jsx',
    '**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js', '**/*.spec.jsx',
    '**/__tests__/**/*.{ts,tsx,js,jsx}',
    '**/test/**/*.{ts,tsx,js,jsx}',
    '**/tests/**/*.{ts,tsx,js,jsx}',
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
];
/** Detect language from the presence of .ts/.tsx files vs .js only. */
function detectLanguage(sourceFiles) {
    const hasTS = sourceFiles.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    const hasJS = sourceFiles.some((f) => f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.mjs'));
    if (hasTS && hasJS)
        return 'mixed';
    if (hasTS)
        return 'typescript';
    if (hasJS)
        return 'javascript';
    return 'unknown';
}
/** Detect package manager from lockfile presence. */
function detectPackageManager(repoPath) {
    if ((0, security_1.fileExists)(path_1.default.join(repoPath, 'pnpm-lock.yaml')))
        return 'pnpm';
    if ((0, security_1.fileExists)(path_1.default.join(repoPath, 'yarn.lock')))
        return 'yarn';
    if ((0, security_1.fileExists)(path_1.default.join(repoPath, 'package-lock.json')))
        return 'npm';
    return 'unknown';
}
/** Detect test frameworks from devDependencies and config files. */
function detectTestFrameworks(devDeps, configFiles) {
    const found = new Set();
    const allKeys = Object.keys(devDeps).map((k) => k.toLowerCase());
    const configNames = configFiles.map((f) => path_1.default.basename(f).toLowerCase());
    if (allKeys.some((k) => k === 'jest' || k.startsWith('@jest/')))
        found.add('jest');
    if (allKeys.some((k) => k === 'vitest'))
        found.add('vitest');
    if (allKeys.some((k) => k === 'mocha' || k === '@types/mocha'))
        found.add('mocha');
    if (allKeys.some((k) => k === 'jasmine' || k === 'jasmine-core'))
        found.add('jasmine');
    if (allKeys.some((k) => k === 'ava'))
        found.add('ava');
    // Fallback: config file names
    if (found.size === 0) {
        if (configNames.some((n) => n.startsWith('jest.config')))
            found.add('jest');
        if (configNames.some((n) => n.startsWith('vitest.config')))
            found.add('vitest');
        if (configNames.some((n) => n.startsWith('.mocharc')))
            found.add('mocha');
    }
    return Array.from(found);
}
/** Detect the primary framework from dependencies. */
function detectFramework(deps, devDeps) {
    const all = { ...deps, ...devDeps };
    const keys = Object.keys(all).map((k) => k.toLowerCase());
    if (keys.includes('next'))
        return 'Next.js';
    if (keys.includes('nuxt') || keys.includes('nuxt3'))
        return 'Nuxt';
    if (keys.includes('remix'))
        return 'Remix';
    if (keys.includes('@nestjs/core'))
        return 'NestJS';
    if (keys.includes('express'))
        return 'Express';
    if (keys.includes('fastify'))
        return 'Fastify';
    if (keys.includes('koa'))
        return 'Koa';
    if (keys.includes('hapi') || keys.includes('@hapi/hapi'))
        return 'Hapi';
    if (keys.includes('react') && keys.includes('vite'))
        return 'React + Vite';
    if (keys.includes('react'))
        return 'React';
    if (keys.includes('vue'))
        return 'Vue';
    if (keys.includes('svelte'))
        return 'Svelte';
    if (keys.includes('@angular/core'))
        return 'Angular';
    return undefined;
}
/** Detect git remote from .git/config. */
function detectGitRemote(repoPath) {
    const gitConfig = (0, security_1.readFileSafe)(path_1.default.join(repoPath, '.git', 'config'));
    if (!gitConfig)
        return undefined;
    const match = gitConfig.match(/url\s*=\s*(.+)/);
    return match?.[1]?.trim();
}
/** Find likely entry point files. */
function findEntryPoints(repoPath, scripts, sourceFiles) {
    const entries = [];
    // From package.json "main" or "module"
    const pkgPath = path_1.default.join(repoPath, 'package.json');
    const pkg = (0, security_1.parseJsonSafe)((0, security_1.readFileSafe)(pkgPath) ?? '');
    if (pkg?.main && typeof pkg.main === 'string') {
        entries.push((0, security_1.relativePath)(repoPath, path_1.default.resolve(repoPath, pkg.main)));
    }
    if (pkg?.module && typeof pkg.module === 'string') {
        entries.push((0, security_1.relativePath)(repoPath, path_1.default.resolve(repoPath, pkg.module)));
    }
    // Common entry file names
    const commonEntries = ['src/index.ts', 'src/index.js', 'src/server.ts', 'src/server.js',
        'src/app.ts', 'src/app.js', 'index.ts', 'index.js', 'server.ts', 'server.js', 'app.ts', 'app.js'];
    for (const e of commonEntries) {
        if ((0, security_1.fileExists)(path_1.default.join(repoPath, e)))
            entries.push(e);
    }
    return [...new Set(entries)].slice(0, 5);
}
/**
 * Scan a repository directory and return its profile.
 * Never modifies the repository — read-only.
 */
async function analyzeRepository(repoPath) {
    // ── 1. Source files ────────────────────────────────────────────────────────
    const sourceGlob = SOURCE_EXTENSIONS.map((ext) => `**/*.${ext}`);
    const allSourceFiles = await (0, fast_glob_1.default)(sourceGlob, {
        cwd: repoPath,
        ignore: IGNORE_DIRS,
        absolute: false,
        followSymbolicLinks: false,
    });
    // ── 2. Test files (subset of source files matching test patterns) ──────────
    const testFilesSet = await (0, fast_glob_1.default)(TEST_PATTERNS, {
        cwd: repoPath,
        ignore: IGNORE_DIRS,
        absolute: false,
        followSymbolicLinks: false,
    });
    const testFilesNorm = new Set(testFilesSet.map((f) => f.replace(/\\/g, '/')));
    const pureSourceFiles = allSourceFiles.filter((f) => !testFilesNorm.has(f.replace(/\\/g, '/')));
    // ── 3. Config files ────────────────────────────────────────────────────────
    const configFiles = await (0, fast_glob_1.default)(CONFIG_FILE_NAMES, {
        cwd: repoPath,
        ignore: IGNORE_DIRS,
        absolute: false,
        followSymbolicLinks: false,
        dot: true,
    });
    const pkgContent = (0, security_1.readFileSafe)(path_1.default.join(repoPath, 'package.json'));
    const pkg = pkgContent ? (0, security_1.parseJsonSafe)(pkgContent) : null;
    const dependencies = pkg?.dependencies ?? {};
    const devDependencies = pkg?.devDependencies ?? {};
    const scripts = pkg?.scripts ?? {};
    const nodeVersion = pkg?.engines?.node;
    // Workspaces / monorepo
    let workspaces = [];
    if (Array.isArray(pkg?.workspaces)) {
        workspaces = pkg.workspaces;
    }
    else if (pkg?.workspaces && typeof pkg.workspaces === 'object') {
        workspaces = pkg.workspaces.packages ?? [];
    }
    const isMonorepo = workspaces.length > 0
        || (0, security_1.fileExists)(path_1.default.join(repoPath, 'pnpm-workspace.yaml'))
        || (0, security_1.fileExists)(path_1.default.join(repoPath, 'lerna.json'));
    // ── 5. Derived attributes ──────────────────────────────────────────────────
    const language = detectLanguage(pureSourceFiles);
    const packageManager = detectPackageManager(repoPath);
    const testFrameworks = detectTestFrameworks(devDependencies, configFiles);
    const framework = detectFramework(dependencies, devDependencies);
    const isGitRepo = (0, security_1.fileExists)(path_1.default.join(repoPath, '.git'));
    const gitRemote = isGitRepo ? detectGitRemote(repoPath) : undefined;
    const hasTypes = (0, security_1.fileExists)(path_1.default.join(repoPath, 'tsconfig.json'))
        || Object.keys(devDependencies).some((d) => d === 'typescript');
    const entryPoints = findEntryPoints(repoPath, scripts, pureSourceFiles);
    // ── 6. Total file count (everything, for context) ─────────────────────────
    const allFiles = await (0, fast_glob_1.default)('**', {
        cwd: repoPath,
        ignore: IGNORE_DIRS,
        absolute: false,
        followSymbolicLinks: false,
        dot: true,
    });
    return {
        name: pkg?.name ?? (0, security_1.repoName)(repoPath),
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
//# sourceMappingURL=repositoryAnalyzer.js.map