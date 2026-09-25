"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeTests = analyzeTests;
exports.analyzeEnvVars = analyzeEnvVars;
exports.analyzePortMentions = analyzePortMentions;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ts_morph_1 = require("ts-morph");
const fast_glob_1 = __importDefault(require("fast-glob"));
const security_1 = require("../utils/security");
// ─── Test file analysis ───────────────────────────────────────────────────────
const TEST_FRAMEWORK_IMPORTS = {
    'vitest': 'vitest',
    '@jest/globals': 'jest',
    'jest': 'jest',
    'mocha': 'mocha',
    '@types/mocha': 'mocha',
    'jasmine': 'jasmine',
    'ava': 'ava',
};
function detectFrameworkFromImports(sourceFile) {
    for (const imp of sourceFile.getImportDeclarations()) {
        const mod = imp.getModuleSpecifierValue();
        if (TEST_FRAMEWORK_IMPORTS[mod])
            return TEST_FRAMEWORK_IMPORTS[mod];
    }
    // Fallback: check for global describe/it/test usage without imports (jest/mocha globals)
    const text = sourceFile.getFullText();
    if (/\bvitest\b/.test(text))
        return 'vitest';
    if (/\bdescribe\b.*\btest\b/.test(text) || /\btest\b/.test(text))
        return 'jest';
    return 'unknown';
}
function countTestsInText(text) {
    // Count `it(`, `test(`, `it.each(`, `test.each(`
    const matches = text.match(/\b(?:it|test)\s*[\.(]/g);
    return matches ? matches.length : 0;
}
function extractDescribeBlocks(text) {
    const results = [];
    const re = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(text)) !== null)
        results.push(m[1]);
    return results;
}
function extractItBlocks(text) {
    const results = [];
    const re = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(text)) !== null)
        results.push(m[1]);
    return results.slice(0, 20); // cap for performance
}
function extractTestImports(sourceFile, repoRoot, testFilePath) {
    const covered = [];
    const testDir = path_1.default.dirname(path_1.default.join(repoRoot, testFilePath));
    for (const imp of sourceFile.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue();
        if (!spec.startsWith('.'))
            continue; // skip node_modules
        // Resolve relative to test file
        const resolved = path_1.default.resolve(testDir, spec);
        // Try with and without extension
        const candidates = [resolved, `${resolved}.ts`, `${resolved}.js`, `${resolved}/index.ts`, `${resolved}/index.js`];
        for (const c of candidates) {
            if (fs_1.default.existsSync(c)) {
                covered.push((0, security_1.relativePath)(repoRoot, c));
                break;
            }
        }
    }
    return covered;
}
/**
 * Analyse test files and build a TestProfile.
 */
function analyzeTests(repoPath, testFiles) {
    const suites = [];
    const coveredFiles = new Set();
    if (testFiles.length === 0) {
        return { totalTestFiles: 0, totalTestCount: 0, suites, coveredFiles };
    }
    const project = new ts_morph_1.Project({
        useInMemoryFileSystem: false,
        skipAddingFilesFromTsConfig: true,
        compilerOptions: { allowJs: true },
    });
    for (const rel of testFiles.slice(0, 100)) {
        try {
            project.addSourceFileAtPath(path_1.default.join(repoPath, rel));
        }
        catch {
            // skip unreadable
        }
    }
    let totalTestCount = 0;
    for (const sourceFile of project.getSourceFiles()) {
        const filePath = (0, security_1.relativePath)(repoPath, sourceFile.getFilePath());
        const text = sourceFile.getFullText();
        const framework = detectFrameworkFromImports(sourceFile);
        const testCount = countTestsInText(text);
        const describeBlocks = extractDescribeBlocks(text);
        const itBlocks = extractItBlocks(text);
        const importsUnder = extractTestImports(sourceFile, repoPath, filePath);
        totalTestCount += testCount;
        importsUnder.forEach((f) => coveredFiles.add(f));
        suites.push({ filePath, framework, testCount, describeBlocks, itBlocks, importsUnder });
    }
    return { totalTestFiles: testFiles.length, totalTestCount, suites, coveredFiles };
}
// ─── Env var analysis ─────────────────────────────────────────────────────────
const ENV_USAGE_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const ENV_DEFINE_RE = /^([A-Z_][A-Z0-9_]*)(?:\s*=.*)?$/;
/** Parse a .env-style file and return variable names (values are intentionally ignored). */
function parseEnvFile(content) {
    return content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
        const m = ENV_DEFINE_RE.exec(l);
        return m ? m[1] : null;
    })
        .filter((n) => n !== null);
}
/**
 * Scan all env var usage and declarations across the repository.
 * Values are never read or stored.
 */
async function analyzeEnvVars(repoPath, sourceFiles) {
    const defined = new Map(); // name → files where defined
    const used = new Map(); // name → files where used
    const defaults = new Set(); // names with default values
    // ── Declared in .env files ──────────────────────────────────────────────────
    const envFiles = await (0, fast_glob_1.default)([
        '.env.example', '.env.sample', '.env.template', '.env.defaults',
        'docker-compose.yml', 'docker-compose.yaml',
        '.github/workflows/*.yml', '.github/workflows/*.yaml',
    ], { cwd: repoPath, absolute: false, dot: true });
    for (const relPath of envFiles) {
        const content = (0, security_1.readFileSafe)(path_1.default.join(repoPath, relPath));
        if (!content)
            continue;
        if (relPath.endsWith('.yml') || relPath.endsWith('.yaml')) {
            // Extract `env:` sections from YAML (simple regex, not full YAML parse)
            const yamlEnvRe = /(?:^|\s{2,})([A-Z_][A-Z0-9_]*)\s*:/gm;
            let m;
            while ((m = yamlEnvRe.exec(content)) !== null) {
                const name = m[1];
                if (!defined.has(name))
                    defined.set(name, new Set());
                defined.get(name).add(relPath);
            }
        }
        else {
            for (const name of parseEnvFile(content)) {
                if (!defined.has(name))
                    defined.set(name, new Set());
                defined.get(name).add(relPath);
                // If it has a default value (line has = something non-empty)
                const line = content.split('\n').find((l) => l.startsWith(`${name}=`));
                if (line && line.split('=')[1]?.trim())
                    defaults.add(name);
            }
        }
    }
    // ── Used in source files via process.env.NAME ──────────────────────────────
    for (const relPath of sourceFiles.slice(0, 200)) {
        const content = (0, security_1.readFileSafe)(path_1.default.join(repoPath, relPath));
        if (!content)
            continue;
        let m;
        const re = new RegExp(ENV_USAGE_RE.source, 'g');
        while ((m = re.exec(content)) !== null) {
            const name = m[1];
            if (!used.has(name))
                used.set(name, new Set());
            used.get(name).add(relPath);
            // Detect nullish coalescing default: process.env.FOO ?? 'default'
            const afterMatch = content.slice(m.index + m[0].length, m.index + m[0].length + 20);
            if (/^\s*(?:\?\?|[|][|])/.test(afterMatch))
                defaults.add(name);
        }
    }
    // ── Merge ──────────────────────────────────────────────────────────────────
    const allNames = new Set([...defined.keys(), ...used.keys()]);
    const results = [];
    for (const name of allNames) {
        results.push({
            name,
            definedIn: Array.from(defined.get(name) ?? []),
            usedIn: Array.from(used.get(name) ?? []),
            hasDefault: defaults.has(name),
            isSecret: (0, security_1.isSecretName)(name),
        });
    }
    return results.sort((a, b) => {
        // Surface secrets and missing vars first
        if (a.isSecret !== b.isSecret)
            return a.isSecret ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}
// ─── Port analysis ────────────────────────────────────────────────────────────
const PORT_RE = /(?:port|PORT|listen|EXPOSE)\D{0,20}(\d{2,5})/gi;
const VALID_PORTS = { min: 80, max: 65535 };
/**
 * Find all port number mentions across config and source files.
 */
async function analyzePortMentions(repoPath, filePaths) {
    const mentions = [];
    const seen = new Set();
    for (const relPath of filePaths.slice(0, 100)) {
        const content = (0, security_1.readFileSafe)(path_1.default.join(repoPath, relPath));
        if (!content)
            continue;
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
            const re = new RegExp(PORT_RE.source, 'gi');
            let m;
            while ((m = re.exec(line)) !== null) {
                const port = parseInt(m[1], 10);
                if (port < VALID_PORTS.min || port > VALID_PORTS.max)
                    continue;
                const key = `${relPath}:${port}:${idx}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                // Trim context to avoid leaking sensitive values
                const context = line.trim().slice(0, 80);
                mentions.push({ port, filePath: relPath, context, line: idx + 1 });
            }
        });
    }
    return mentions;
}
//# sourceMappingURL=configAnalyzer.js.map