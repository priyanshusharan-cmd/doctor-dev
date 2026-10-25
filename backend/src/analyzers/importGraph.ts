import path from 'node:path';
import fs from 'node:fs';
import fg from 'fast-glob';
import { parseJsonSafe, readFileSafe } from '../utils/security';

// A lightweight, regex-based module graph for JavaScript/TypeScript and Python.
// It answers one question for TestPilot: which production files does each test load,
// directly or through other modules? Regex extraction is deliberate — it is fast enough
// to cover thousands of files and tolerant of syntax ts-morph cannot parse.

const JS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const JS_FILE_RE = /\.(?:[mc]?[jt]sx?)$/i;

const ESM_FROM_RE = /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const JEST_MOCK_RE = /\b(?:jest|vi)\.(?:mock|requireActual|importActual)\s*\(\s*['"]([^'"\n]+)['"]/g;
const PY_IMPORT_RE = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm;
// Names are either parenthesized (may span lines) or run to the end of the same line.
const PY_FROM_RE = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(?:\(([^)]*)\)|([^\n#;]+))/gm;

/** Extract raw import specifiers from a source file. */
export function extractSpecifiers(content: string, filePath: string): string[] {
  const specs: string[] = [];
  const collect = (re: RegExp): void => {
    const rx = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(content)) !== null) specs.push(m[1]);
  };
  if (filePath.endsWith('.py')) {
    const rx = new RegExp(PY_IMPORT_RE.source, PY_IMPORT_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(content)) !== null) specs.push(...m[1].split(',').map((s) => s.trim().split(/\s+/)[0]));
    const fx = new RegExp(PY_FROM_RE.source, PY_FROM_RE.flags);
    while ((m = fx.exec(content)) !== null) {
      const base = m[1];
      specs.push(base);
      // `from pkg import mod` may import a submodule rather than a name
      for (const name of (m[2] ?? m[3]).split(',').map((s) => s.trim().split(/\s+/)[0]).filter((n) => n && n !== '*')) {
        specs.push(base.endsWith('.') ? `${base}${name}` : `${base}.${name}`);
      }
    }
    return specs;
  }
  collect(ESM_FROM_RE);
  collect(REQUIRE_RE);
  collect(DYNAMIC_IMPORT_RE);
  collect(JEST_MOCK_RE);
  return specs;
}

interface LocalPackage {
  name: string;
  dir: string; // repo-relative, '' for the root
  entries: string[]; // repo-relative candidate entry files (unresolved)
}

/** Collect entry candidates from package.json fields (main, module, source, exports). */
function packageEntries(pkg: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown): void => { if (typeof v === 'string') out.push(v); };
  push(pkg.source);
  const walkExports = (v: unknown): void => {
    if (typeof v === 'string') { out.push(v); return; }
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      // Prefer the root export, then conditions in typical priority order
      for (const key of ['.', 'source', 'import', 'require', 'node', 'default', 'types']) {
        if (key in obj) walkExports(obj[key]);
      }
    }
  };
  walkExports(pkg.exports);
  push(pkg.module);
  push(pkg.main);
  return out;
}

export interface ModuleResolver {
  resolve(fromFile: string, spec: string): string | null;
}

/**
 * Build a resolver for repo-local imports: relative paths, the repository's own package
 * names (tests often import the package by name), workspace packages, tsconfig path
 * aliases, and Python modules under the root or `src/`.
 */
export async function createResolver(repoPath: string, knownFiles: Set<string>): Promise<ModuleResolver> {
  const has = (rel: string): boolean => knownFiles.has(rel);

  // Local packages (root + workspaces), skipping dependencies.
  const pkgFiles = await fg(['package.json', '**/package.json'], {
    cwd: repoPath, ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'], deep: 5, suppressErrors: true,
  });
  const localPackages: LocalPackage[] = [];
  for (const rel of pkgFiles.slice(0, 200)) {
    const pkg = parseJsonSafe<Record<string, unknown>>(readFileSafe(path.join(repoPath, rel)) ?? '');
    if (!pkg || typeof pkg.name !== 'string') continue;
    const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    localPackages.push({ name: pkg.name, dir, entries: packageEntries(pkg).map((e) => path.posix.join(dir, e)) });
  }
  localPackages.sort((a, b) => b.name.length - a.name.length);

  // tsconfig "paths" aliases such as "@/*" → "src/*"
  const aliases: Array<{ prefix: string; targets: string[] }> = [];
  const tsconfig = parseJsonSafe<{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }>(
    (readFileSafe(path.join(repoPath, 'tsconfig.json')) ?? '').replace(/^\s*\/\/.*$/gm, ''),
  );
  const baseUrl = tsconfig?.compilerOptions?.baseUrl ?? '.';
  for (const [pattern, targets] of Object.entries(tsconfig?.compilerOptions?.paths ?? {})) {
    aliases.push({
      prefix: pattern.replace(/\*$/, ''),
      targets: targets.map((t) => path.posix.normalize(path.posix.join(baseUrl, t.replace(/\*$/, '')))),
    });
  }

  // Python import roots: the repo, src/, and every directory holding a project file
  // (e.g. backend/pyproject.toml makes "backend/app/x.py" importable as "app.x").
  const projectFiles = await fg(['**/pyproject.toml', '**/setup.py', '**/setup.cfg'], {
    cwd: repoPath, ignore: ['**/node_modules/**', '**/.git/**', '**/.venv/**', '**/venv/**'], deep: 4, suppressErrors: true,
  });
  const pythonRoots = [...new Set(['', 'src/', 'lib/', ...(fs.existsSync(path.join(repoPath, 'python')) ? ['python/'] : []),
    ...projectFiles.map((f) => path.posix.dirname(f)).filter((d) => d !== '.').flatMap((d) => [`${d}/`, `${d}/src/`])])];

  /** Try a path as a file, with JS extension probing, `.js`→`.ts` remapping, and directory indexes. */
  function probe(base: string, depth = 0): string | null {
    let norm = path.posix.normalize(base).replace(/^\.\//, '').replace(/\/$/, '');
    if (norm === '.') norm = '';
    if (norm.startsWith('..')) return null;
    if (has(norm) && JS_FILE_RE.test(norm)) return norm;
    // TypeScript ESM imports reference the emitted ".js" file
    const withoutExt = norm.replace(/\.(?:[mc]?js|jsx)$/, '');
    for (const ext of JS_EXTENSIONS) if (has(withoutExt + ext)) return withoutExt + ext;
    const indexBase = norm ? `${norm}/index` : 'index';
    for (const ext of JS_EXTENSIONS) if (has(indexBase + ext)) return indexBase + ext;
    // A directory with its own package.json (e.g. require('..') from tests)
    if (depth === 0) {
      const pkg = localPackages.find((p) => p.dir === norm);
      if (pkg) {
        for (const entry of [...pkg.entries, path.posix.join(pkg.dir, 'index')]) {
          const hit = probe(entry, 1) ?? probe(mapBuildToSource(entry), 1);
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  /** Package entries often point at build output; map dist/build/lib back to src. */
  function mapBuildToSource(entry: string): string {
    return entry.replace(/(^|\/)(dist|build|out|lib|esm|cjs)\//, '$1src/');
  }

  function resolvePackage(spec: string): string | null {
    for (const pkg of localPackages) {
      if (spec !== pkg.name && !spec.startsWith(`${pkg.name}/`)) continue;
      const sub = spec.slice(pkg.name.length).replace(/^\//, '');
      if (!sub) {
        for (const entry of pkg.entries) {
          const hit = probe(entry, 1) ?? probe(mapBuildToSource(entry), 1);
          if (hit) return hit;
        }
        for (const fallback of ['src/index', 'index', 'lib/index', 'source/index', 'src/main']) {
          const hit = probe(path.posix.join(pkg.dir, fallback), 1);
          if (hit) return hit;
        }
        return null;
      }
      return probe(path.posix.join(pkg.dir, sub), 1)
        ?? probe(path.posix.join(pkg.dir, 'src', sub), 1)
        ?? probe(path.posix.join(pkg.dir, 'lib', sub), 1)
        ?? probe(path.posix.join(pkg.dir, 'source', sub), 1);
    }
    return null;
  }

  function resolvePython(fromFile: string, spec: string): string | null {
    let modulePath: string;
    if (spec.startsWith('.')) {
      const dots = spec.match(/^\.+/)![0].length;
      let dir = path.posix.dirname(fromFile);
      for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir);
      const rest = spec.slice(dots).replace(/\./g, '/');
      modulePath = path.posix.join(dir === '.' ? '' : dir, rest);
      return has(`${modulePath}.py`) ? `${modulePath}.py` : has(`${modulePath}/__init__.py`) ? `${modulePath}/__init__.py` : null;
    }
    modulePath = spec.replace(/\./g, '/');
    for (const root of pythonRoots) {
      if (has(`${root}${modulePath}.py`)) return `${root}${modulePath}.py`;
      if (has(`${root}${modulePath}/__init__.py`)) return `${root}${modulePath}/__init__.py`;
    }
    return null;
  }

  return {
    resolve(fromFile: string, spec: string): string | null {
      if (fromFile.endsWith('.py')) return resolvePython(fromFile, spec);
      if (spec.startsWith('node:')) return null;
      if (spec.startsWith('.') || spec.startsWith('/')) {
        return probe(path.posix.join(path.posix.dirname(fromFile), spec));
      }
      for (const alias of aliases) {
        if (alias.prefix && spec.startsWith(alias.prefix)) {
          for (const target of alias.targets) {
            const hit = probe(path.posix.join(target, spec.slice(alias.prefix.length)));
            if (hit) return hit;
          }
        }
      }
      return resolvePackage(spec);
    },
  };
}

/** Repo-relative file → repo-relative files it imports. */
export type ImportGraph = Map<string, Set<string>>;

/** Build the import graph for the given files. */
export function buildImportGraph(
  files: string[],
  readContent: (rel: string) => string | null,
  resolver: ModuleResolver,
): ImportGraph {
  const graph: ImportGraph = new Map();
  for (const file of files) {
    const content = readContent(file);
    const targets = new Set<string>();
    if (content) {
      for (const spec of extractSpecifiers(content, file)) {
        const hit = resolver.resolve(file, spec);
        if (hit && hit !== file) targets.add(hit);
      }
    }
    graph.set(file, targets);
  }
  return graph;
}

export interface Reach {
  /** Number of production modules between the test and this file (1 = imported directly). */
  depth: number;
  /** Test files that reach this file at that depth. */
  tests: Set<string>;
}

/**
 * Walk the graph from every test file. Hops through non-production files (test helpers,
 * fixtures) are free, so a test that imports a helper which imports `src/x` still counts
 * as importing `src/x` directly.
 */
export function reachFromTests(
  graph: ImportGraph,
  testFiles: string[],
  isProduction: (rel: string) => boolean,
  maxDepth = 6,
): Map<string, Reach> {
  const reach = new Map<string, Reach>();
  for (const test of testFiles) {
    // 0-1 BFS: entering a production file costs one hop, entering anything else is free
    const best = new Map<string, number>([[test, 0]]);
    const deque: Array<[string, number]> = [[test, 0]];
    while (deque.length > 0) {
      const [file, depth] = deque.shift()!;
      if (depth > (best.get(file) ?? Infinity)) continue;
      for (const next of graph.get(file) ?? []) {
        const prod = isProduction(next);
        const nextDepth = depth + (prod ? 1 : 0);
        if (nextDepth > maxDepth || nextDepth >= (best.get(next) ?? Infinity)) continue;
        best.set(next, nextDepth);
        if (prod) deque.push([next, nextDepth]); else deque.unshift([next, nextDepth]);
      }
    }
    for (const [file, depth] of best) {
      if (file === test || !isProduction(file)) continue;
      const existing = reach.get(file);
      if (!existing || depth < existing.depth) reach.set(file, { depth, tests: new Set([test]) });
      else if (depth === existing.depth) existing.tests.add(test);
    }
  }
  return reach;
}
