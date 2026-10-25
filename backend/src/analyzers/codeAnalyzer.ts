import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { readFileSafe, relativePath } from '../utils/security';
import { scoreImportance } from './importance';
import type { CodeSymbol, RouteInfo, SymbolKind, SymbolImportance, SourceType } from '../types';

// ─── Importance signals ───────────────────────────────────────────────────────

const HTTP_CLIENT_RECEIVERS = /^(axios|http|https|fetch|client|apiClient|httpClient|superagent|ky|got|\$http|instance|cache|map|params|searchParams|headers|storage|localStorage|sessionStorage)$/i;
const INLINE_FUNCTION_KINDS = new Set([SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression]);
const HANDLER_KINDS = new Set([
  ...INLINE_FUNCTION_KINDS, SyntaxKind.Identifier, SyntaxKind.CallExpression,
  SyntaxKind.PropertyAccessExpression, SyntaxKind.ArrayLiteralExpression,
]);

/** Importance of a symbol; route handlers registered in the same file get extra weight. */
function scoreSymbol(
  name: string,
  filePath: string,
  body: string,
  isExported: boolean,
  _paramCount: number,
  sourceType: SourceType,
  handlers: Set<string>,
): { importance: SymbolImportance; reasons: string[] } {
  return scoreImportance({ name, filePath, body, isExported, sourceType, isRouteHandler: handlers.has(name.split('.').pop() ?? name) });
}

/** Files parsed with ts-morph per analysis; the import graph covers everything else. */
const MAX_AST_FILES = 600;
const MAX_AST_FILE_BYTES = 400_000;

/** Bundled or minified code has extremely long lines and no useful symbols. */
export function isMinified(text: string): boolean {
  const sample = text.slice(0, 20_000);
  const lines = sample.split('\n');
  return lines.some((l) => l.length > 2_000) || (sample.length > 5_000 && lines.length < 5);
}

export function getSourceType(filePath: string): SourceType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)(examples?|samples?|sandbox)\//.test(normalized)) return 'examples';
  if (/(^|\/)(benchmarks?|bench|perf)(\/|\.[a-z]+$)/.test(normalized)) return 'benchmarks';
  if (/(^|\/)(fixtures?|mocks?|__mocks__|e2e)\//.test(normalized)) return 'fixtures';
  if (/(^|\/)docs?\//.test(normalized)) return 'documentation';
  if (/(^|\/)(tests?|__tests__|specs?|test-d|test-types|integration|e2e-tests?)\//.test(normalized) || /\.(test|spec|test-d)\./.test(normalized)) return 'tests';
  if (/(^|\/)generated\//.test(normalized)) return 'generated';
  if (/(^|\/)(build|scripts?|tools?)\//.test(normalized)) return 'build';
  if (/(^|\/)configs?\//.test(normalized) || filePath.includes('.config.')) return 'configuration';
  return 'production';
}

function kindFromFilePath(filePath: string): SymbolKind {
  if (/\/(controllers?|handlers?)\//i.test(filePath)) return 'controller';
  if (/\/(services?)\//i.test(filePath)) return 'service';
  if (/\/(utils?|helpers?|lib)\//i.test(filePath)) return 'utility';
  return 'function';
}

/** Extract route registrations like `router.get('/path', handler)` */
function extractRoutes(sourceFile: ReturnType<InstanceType<typeof Project>['addSourceFileAtPath']>, repoRoot: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const filePath = relativePath(repoRoot, sourceFile.getFilePath());
  const sourceType = getSourceType(filePath);

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node.asKind(SyntaxKind.CallExpression);
    if (!call) return;

    const expr = call.getExpression();
    const exprText = expr.getText();

    // Match: router.get / app.post / this.router.delete etc. `.use()` mounts middleware or
    // sub-routers rather than defining an endpoint, so it is not treated as a route.
    const match = exprText.match(/(?:^|\.)(get|post|put|patch|delete|all)$/i);
    if (!match) return;

    const args = call.getArguments();
    // A route registration needs a path and at least one handler.
    if (args.length < 2) return;

    const firstArg = args[0];
    if (firstArg.getKind() !== SyntaxKind.StringLiteral && firstArg.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral) return;
    const routePath = firstArg.getText().slice(1, -1);
    if (!routePath.startsWith('/')) return;

    const rest = args.slice(1);
    if (!rest.some((a) => HANDLER_KINDS.has(a.getKind()))) return;

    // HTTP clients (axios.get('/users'), client.post('/login', body)) call routes rather than
    // define them. A client call never passes an inline function, so those still count.
    const receiver = exprText.split('.').slice(-2, -1)[0] ?? '';
    const hasInlineHandler = rest.some((a) => INLINE_FUNCTION_KINDS.has(a.getKind()));
    if (HTTP_CLIENT_RECEIVERS.test(receiver) && !hasInlineHandler) return;

    const method = match[1].toUpperCase() as RouteInfo['method'];
    const line = node.getStartLineNumber();

    // Try to get handler name
    let handlerName: string | undefined;
    if (args.length >= 2) {
      const lastArg = args[args.length - 1];
      if (lastArg.getKind() === SyntaxKind.Identifier) {
        handlerName = lastArg.getText();
      }
    }

    routes.push({ method, path: routePath, filePath, sourceType, handlerName, line });
  });

  return routes;
}

/**
 * Analyse JavaScript/TypeScript source files in a repository using AST.
 * Returns CodeSymbols and RouteInfo arrays.
 */
export function analyzeCode(
  repoPath: string,
  sourceFiles: string[],
): { symbols: CodeSymbol[]; routes: RouteInfo[] } {
  const symbols: CodeSymbol[] = [];
  const routes: RouteInfo[] = [];

  const jsTsFiles = sourceFiles.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f));
  if (jsTsFiles.length === 0) return { symbols, routes };

  // Parse from text in an in-memory project: TypeScript never touches the disk, loads no
  // lib files, and never follows imports, so one bad file cannot slow or break the run.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, noLib: true, noResolve: true },
  });

  // Production code first, so the cap never crowds it out with examples or scripts
  const filesToAnalyze = [...jsTsFiles]
    .sort((a, b) => Number(getSourceType(a) !== 'production') - Number(getSourceType(b) !== 'production'))
    .slice(0, MAX_AST_FILES);

  for (const rel of filesToAnalyze) {
    const text = readFileSafe(path.join(repoPath, rel), MAX_AST_FILE_BYTES);
    if (!text || isMinified(text)) continue;
    try {
      project.createSourceFile(`/repo/${rel}`, text, { overwrite: true });
    } catch {
      // Skip files that fail to parse
    }
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath().replace(/^\/repo\//, '');
    const sourceType = getSourceType(filePath);

    // ── Routes ────────────────────────────────────────────────────────────────
    const fileRoutes = extractRoutes(sourceFile, '/repo');
    routes.push(...fileRoutes);
    const handlers = new Set(fileRoutes.map((r) => r.handlerName).filter((n): n is string => !!n));

    // ── Functions ─────────────────────────────────────────────────────────────
    sourceFile.getFunctions().forEach((fn) => {
      const name = fn.getName();
      if (!name) return; // anonymous

      const body = fn.getBodyText() ?? '';
      const isExported = fn.isExported() || fn.isDefaultExport();
      const params = fn.getParameters().length;
      const { importance, reasons } = scoreSymbol(name, filePath, body, isExported, params, sourceType, handlers);
      const start = fn.getStartLineNumber();
      const end = fn.getEndLineNumber();

      symbols.push({
        name,
        kind: kindFromFilePath(filePath),
        filePath,
        sourceType,
        lineStart: start,
        lineEnd: end,
        isExported,
        importance,
        importanceReasons: reasons,
        isAsync: fn.isAsync(),
        paramCount: params,
      });
    });

    // ── Classes ───────────────────────────────────────────────────────────────
    sourceFile.getClasses().forEach((cls) => {
      const name = cls.getName();
      if (!name) return;

      const isExported = cls.isExported() || cls.isDefaultExport();
      const clsBody = cls.getMembers().map((m) => m.getText()).join(' ');
      const { importance, reasons } = scoreSymbol(name, filePath, clsBody, isExported, 0, sourceType, handlers);

      symbols.push({
        name,
        kind: 'class',
        filePath,
        sourceType,
        lineStart: cls.getStartLineNumber(),
        lineEnd: cls.getEndLineNumber(),
        isExported,
        importance,
        importanceReasons: reasons,
        isAsync: false,
        paramCount: 0,
      });

      // ── Methods ───────────────────────────────────────────────────────────
      cls.getMethods().forEach((method) => {
        const mName = method.getName();
        const mBody = method.getBodyText() ?? '';
        const mExported = isExported; // methods inherit class export
        const mParams = method.getParameters().length;
        const { importance: mImp, reasons: mReasons } = scoreSymbol(
          `${name}.${mName}`, filePath, mBody, mExported, mParams, sourceType, handlers
        );

        symbols.push({
          name: `${name}.${mName}`,
          kind: 'method',
          filePath,
          sourceType,
          lineStart: method.getStartLineNumber(),
          lineEnd: method.getEndLineNumber(),
          isExported: mExported,
          importance: mImp,
          importanceReasons: mReasons,
          isAsync: method.isAsync(),
          paramCount: mParams,
        });
      });
    });

    // ── Arrow functions assigned to exported consts ───────────────────────────
    sourceFile.getVariableDeclarations().forEach((decl) => {
      const init = decl.getInitializer();
      if (!init) return;
      if (
        init.getKind() !== SyntaxKind.ArrowFunction &&
        init.getKind() !== SyntaxKind.FunctionExpression
      ) return;

      const name = decl.getName();
      const varStmt = decl.getVariableStatement();
      const isExported = varStmt ? (varStmt.isExported() || varStmt.isDefaultExport()) : false;
      const body = init.getText();
      const params =
        init.getKind() === SyntaxKind.ArrowFunction
          ? (init.asKind(SyntaxKind.ArrowFunction)?.getParameters().length ?? 0)
          : (init.asKind(SyntaxKind.FunctionExpression)?.getParameters().length ?? 0);
      const { importance, reasons } = scoreSymbol(name, filePath, body, isExported, params, sourceType, handlers);

      symbols.push({
        name,
        kind: 'arrow_function',
        filePath,
        sourceType,
        lineStart: decl.getStartLineNumber(),
        lineEnd: decl.getEndLineNumber(),
        isExported,
        importance,
        importanceReasons: reasons,
        isAsync: init.getKind() === SyntaxKind.ArrowFunction
          ? (init.asKind(SyntaxKind.ArrowFunction)?.isAsync() ?? false)
          : false,
        paramCount: params,
      });
    });
  }

  return { symbols, routes };
}
