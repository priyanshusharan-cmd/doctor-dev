import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { relativePath } from '../utils/security';
import type { CodeSymbol, RouteInfo, SymbolKind, SymbolImportance, SourceType } from '../types';

// ─── Importance signals ───────────────────────────────────────────────────────

const AUTH_PATTERNS = /\b(auth|login|logout|register|signup|password|jwt|token|session|permission|role|acl|guard|middleware)\b/i;
const DB_PATTERNS = /\b(db|database|query|model|repository|schema|migration|prisma|mongoose|sequelize|knex|sql|insert|update|delete|find|save)\b/i;
const PAYMENT_PATTERNS = /\b(payment|stripe|paypal|checkout|charge|invoice|billing|subscription|plan|price)\b/i;
const ROUTE_PATTERNS = /\b(router|app|route)\.(get|post|put|patch|delete|use|all)\b/i;
const CRITICAL_NAMES = /^(main|bootstrap|init|start|setup|configure|createApp|createServer)\b/i;

function scoreSymbol(
  name: string,
  filePath: string,
  bodyText: string,
  isExported: boolean,
  paramCount: number,
  sourceType: SourceType,
): { importance: SymbolImportance; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const combined = `${name} ${filePath} ${bodyText}`;

  if (AUTH_PATTERNS.test(combined)) { reasons.push('authentication/authorization logic'); score += 3; }
  if (DB_PATTERNS.test(combined)) { reasons.push('database operation'); score += 2; }
  if (PAYMENT_PATTERNS.test(combined)) { reasons.push('payment logic'); score += 3; }
  if (ROUTE_PATTERNS.test(bodyText)) { reasons.push('route handler'); score += 2; }
  if (CRITICAL_NAMES.test(name)) { reasons.push('application lifecycle'); score += 2; }
  if (isExported) { reasons.push('exported — part of public API'); score += 1; }
  if (paramCount > 3) { reasons.push('complex signature'); score += 1; }

  // File path signals
  if (/\/(controllers?|handlers?|routes?)\//i.test(filePath)) { reasons.push('controller/route file'); score += 2; }
  if (/\/(services?|usecases?|domain)\//i.test(filePath)) { reasons.push('service layer'); score += 1; }
  if (/\/(middleware|guards?)\//i.test(filePath)) { reasons.push('middleware'); score += 1; }

  // Penalize non-production code
  if (sourceType === 'examples' || sourceType === 'fixtures' || sourceType === 'benchmarks' || sourceType === 'documentation') {
    score -= 5;
    reasons.push(`${sourceType} code`);
  }

  const importance: SymbolImportance =
    score >= 5 ? 'critical' :
    score >= 3 ? 'high' :
    score >= 1 ? 'medium' :
    'low';

  return { importance, reasons: reasons.slice(0, 4) };
}

export function getSourceType(filePath: string): SourceType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)(examples?|samples?)\//.test(normalized)) return 'examples';
  if (/(^|\/)benchmarks?\//.test(normalized)) return 'benchmarks';
  if (/(^|\/)fixtures?\//.test(normalized)) return 'fixtures';
  if (/(^|\/)docs?\//.test(normalized)) return 'documentation';
  if (/(^|\/)(tests?|__tests__|specs?)\//.test(normalized) || /\.(test|spec)\./.test(normalized)) return 'tests';
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

    // Match: router.get / app.post / this.router.delete etc.
    const match = exprText.match(/(?:^|\.)(get|post|put|patch|delete|all|use)$/i);
    if (!match) return;

    const args = call.getArguments();
    if (args.length === 0) return;

    const firstArg = args[0];
    const routePath = firstArg.getKind() === SyntaxKind.StringLiteral
      ? firstArg.asKind(SyntaxKind.StringLiteral)?.getLiteralValue() ?? firstArg.getText()
      : firstArg.getText();

    // Skip non-path strings (middleware-only registrations)
    if (!routePath.startsWith('/') && !routePath.startsWith("'") && !routePath.startsWith('"')) return;

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

  // ts-morph project — we add files manually, no tsconfig needed
  const project = new Project({
    useInMemoryFileSystem: false,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });

  // Only analyse up to 150 source files to keep performance reasonable
  const filesToAnalyze = jsTsFiles.slice(0, 150);

  for (const rel of filesToAnalyze) {
    const abs = path.join(repoPath, rel);
    try {
      project.addSourceFileAtPath(abs);
    } catch {
      // Skip files that fail to parse (binary, unreadable, etc.)
    }
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = relativePath(repoPath, sourceFile.getFilePath());
    const sourceType = getSourceType(filePath);

    // ── Routes ────────────────────────────────────────────────────────────────
    routes.push(...extractRoutes(sourceFile, repoPath));

    // ── Functions ─────────────────────────────────────────────────────────────
    sourceFile.getFunctions().forEach((fn) => {
      const name = fn.getName();
      if (!name) return; // anonymous

      const body = fn.getBodyText() ?? '';
      const isExported = fn.isExported() || fn.isDefaultExport();
      const params = fn.getParameters().length;
      const { importance, reasons } = scoreSymbol(name, filePath, body, isExported, params, sourceType);
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
      const { importance, reasons } = scoreSymbol(name, filePath, clsBody, isExported, 0, sourceType);

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
          `${name}.${mName}`, filePath, mBody, mExported, mParams, sourceType
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
      const { importance, reasons } = scoreSymbol(name, filePath, body, isExported, params, sourceType);

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
