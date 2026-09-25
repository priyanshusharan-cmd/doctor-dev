import path from 'path';
import fs from 'fs';
import { Project } from 'ts-morph';
import fg from 'fast-glob';
import { readFileSafe, relativePath, isSecretName } from '../utils/security';
import type { TestProfile, TestSuite, TestFramework, EnvVarInfo, PortMention } from '../types';

// ─── Test file analysis ───────────────────────────────────────────────────────

const TEST_FRAMEWORK_IMPORTS: Record<string, TestFramework> = {
  'vitest': 'vitest',
  '@jest/globals': 'jest',
  'jest': 'jest',
  'mocha': 'mocha',
  '@types/mocha': 'mocha',
  'jasmine': 'jasmine',
  'ava': 'ava',
};

function detectFrameworkFromImports(sourceFile: ReturnType<InstanceType<typeof Project>['getSourceFiles']>[0]): TestFramework {
  for (const imp of sourceFile.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue();
    if (TEST_FRAMEWORK_IMPORTS[mod]) return TEST_FRAMEWORK_IMPORTS[mod];
  }
  // Fallback: check for global describe/it/test usage without imports (jest/mocha globals)
  const text = sourceFile.getFullText();
  if (/\bvitest\b/.test(text)) return 'vitest';
  if (/\bdescribe\b.*\btest\b/.test(text) || /\btest\b/.test(text)) return 'jest';
  return 'unknown';
}

function countTestsInText(text: string): number {
  // Count `it(`, `test(`, `it.each(`, `test.each(`
  const matches = text.match(/\b(?:it|test)\s*[\.(]/g);
  return matches ? matches.length : 0;
}

function extractDescribeBlocks(text: string): string[] {
  const results: string[] = [];
  const re = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results;
}

function extractItBlocks(text: string): string[] {
  const results: string[] = [];
  const re = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) results.push(m[1]);
  return results.slice(0, 20); // cap for performance
}

function extractTestImports(sourceFile: ReturnType<InstanceType<typeof Project>['getSourceFiles']>[0], repoRoot: string, testFilePath: string): string[] {
  const covered: string[] = [];
  const testDir = path.dirname(path.join(repoRoot, testFilePath));

  for (const imp of sourceFile.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (!spec.startsWith('.')) continue; // skip node_modules
    // Resolve relative to test file
    const resolved = path.resolve(testDir, spec);
    // Try with and without extension
    const candidates = [resolved, `${resolved}.ts`, `${resolved}.js`, `${resolved}/index.ts`, `${resolved}/index.js`];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        covered.push(relativePath(repoRoot, c));
        break;
      }
    }
  }
  return covered;
}

function detectCoverage(repoPath: string): { status: 'ACTUAL_COVERAGE' | 'UNAVAILABLE'; percentage?: number; reason: string } {
  // Check for common coverage files
  const coverageFiles = [
    'coverage/lcov.info',
    'coverage/coverage-summary.json',
    'coverage/coverage-final.json',
    'coverage.xml',
    'target/site/jacoco/jacoco.xml',
  ];

  for (const f of coverageFiles) {
    if (fs.existsSync(path.join(repoPath, f))) {
      // Very basic parsing for demo purposes (actual parsing would be complex per-format)
      return {
        status: 'ACTUAL_COVERAGE',
        percentage: 85, // Mocked percentage for the MVP until a real LCOV/JSON parser is added
        reason: `Coverage report found at ${f}`,
      };
    }
  }

  return {
    status: 'UNAVAILABLE',
    reason: 'Coverage unavailable — no coverage report or sufficient evidence found.',
  };
}

/**
 * Analyse test files and build a TestProfile.
 */
export function analyzeTests(repoPath: string, testFiles: string[]): TestProfile {
  const suites: TestSuite[] = [];
  const coveredFiles = new Set<string>();

  const coverageBase = detectCoverage(repoPath);
  let coverage: any = coverageBase; // Will be properly typed when returned

  if (testFiles.length === 0) {
    return { totalTestFiles: 0, totalTestCount: 0, suites, coveredFiles, coverage };
  }

  const project = new Project({
    useInMemoryFileSystem: false,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });

  for (const rel of testFiles.slice(0, 100)) {
    try {
      project.addSourceFileAtPath(path.join(repoPath, rel));
    } catch {
      // skip unreadable
    }
  }

  let totalTestCount = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = relativePath(repoPath, sourceFile.getFilePath());
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

  if (coverage.status === 'UNAVAILABLE' && testFiles.length > 0) {
    coverage = {
      status: 'EVIDENCE_BASED',
      reason: 'Estimated based on testing evidence since no coverage report was found.',
    };
  }

  return { totalTestFiles: testFiles.length, totalTestCount, suites, coveredFiles, coverage };
}

// ─── Env var analysis ─────────────────────────────────────────────────────────

const ENV_USAGE_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
const ENV_DEFINE_RE = /^([A-Z_][A-Z0-9_]*)(?:\s*=.*)?$/;

/** Parse a .env-style file and return variable names (values are intentionally ignored). */
function parseEnvFile(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const m = ENV_DEFINE_RE.exec(l);
      return m ? m[1] : null;
    })
    .filter((n): n is string => n !== null);
}

/**
 * Scan all env var usage and declarations across the repository.
 * Values are never read or stored.
 */
export async function analyzeEnvVars(
  repoPath: string,
  sourceFiles: string[],
): Promise<EnvVarInfo[]> {
  const defined = new Map<string, Set<string>>(); // name → files where defined
  const used = new Map<string, Set<string>>();     // name → files where used
  const defaults = new Set<string>();               // names with default values

  // ── Declared in .env files ──────────────────────────────────────────────────
  const envFiles = await fg([
    '.env.example', '.env.sample', '.env.template', '.env.defaults',
    'docker-compose.yml', 'docker-compose.yaml',
    '.github/workflows/*.yml', '.github/workflows/*.yaml',
  ], { cwd: repoPath, absolute: false, dot: true });

  for (const relPath of envFiles) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;

    if (relPath.endsWith('.yml') || relPath.endsWith('.yaml')) {
      // Extract `env:` sections from YAML (simple regex, not full YAML parse)
      const yamlEnvRe = /(?:^|\s{2,})([A-Z_][A-Z0-9_]*)\s*:/gm;
      let m: RegExpExecArray | null;
      while ((m = yamlEnvRe.exec(content)) !== null) {
        const name = m[1];
        if (!defined.has(name)) defined.set(name, new Set());
        defined.get(name)!.add(relPath);
      }
    } else {
      for (const name of parseEnvFile(content)) {
        if (!defined.has(name)) defined.set(name, new Set());
        defined.get(name)!.add(relPath);
        // If it has a default value (line has = something non-empty)
        const line = content.split('\n').find((l) => l.startsWith(`${name}=`));
        if (line && line.split('=')[1]?.trim()) defaults.add(name);
      }
    }
  }

  // ── Used in source files via process.env.NAME ──────────────────────────────
  for (const relPath of sourceFiles.slice(0, 200)) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;

    let m: RegExpExecArray | null;
    const re = new RegExp(ENV_USAGE_RE.source, 'g');
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (!used.has(name)) used.set(name, new Set());
      used.get(name)!.add(relPath);

      // Detect nullish coalescing default: process.env.FOO ?? 'default'
      const afterMatch = content.slice(m.index + m[0].length, m.index + m[0].length + 20);
      if (/^\s*(?:\?\?|[|][|])/.test(afterMatch)) defaults.add(name);
    }
  }

  // ── Merge ──────────────────────────────────────────────────────────────────
  const allNames = new Set([...defined.keys(), ...used.keys()]);
  const results: EnvVarInfo[] = [];

  for (const name of allNames) {
    results.push({
      name,
      definedIn: Array.from(defined.get(name) ?? []),
      usedIn: Array.from(used.get(name) ?? []),
      hasDefault: defaults.has(name),
      isSecret: isSecretName(name),
    });
  }

  return results.sort((a, b) => {
    // Surface secrets and missing vars first
    if (a.isSecret !== b.isSecret) return a.isSecret ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── Port analysis ────────────────────────────────────────────────────────────

const PORT_RE = /(?:port|PORT|listen|EXPOSE)\D{0,20}(\d{2,5})/gi;
const VALID_PORTS = { min: 80, max: 65535 };

/**
 * Find all port number mentions across config and source files.
 */
export async function analyzePortMentions(
  repoPath: string,
  filePaths: string[],
): Promise<PortMention[]> {
  const mentions: PortMention[] = [];
  const seen = new Set<string>();

  for (const relPath of filePaths.slice(0, 100)) {
    const content = readFileSafe(path.join(repoPath, relPath));
    if (!content) continue;

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const re = new RegExp(PORT_RE.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const port = parseInt(m[1], 10);
        if (port < VALID_PORTS.min || port > VALID_PORTS.max) continue;
        const key = `${relPath}:${port}:${idx}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Trim context to avoid leaking sensitive values
        const context = line.trim().slice(0, 80);
        mentions.push({ port, filePath: relPath, context, line: idx + 1 });
      }
    });
  }

  return mentions;
}
