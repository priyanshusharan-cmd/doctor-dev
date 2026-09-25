"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeCode = analyzeCode;
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const security_1 = require("../utils/security");
// ─── Importance signals ───────────────────────────────────────────────────────
const AUTH_PATTERNS = /\b(auth|login|logout|register|signup|password|jwt|token|session|permission|role|acl|guard|middleware)\b/i;
const DB_PATTERNS = /\b(db|database|query|model|repository|schema|migration|prisma|mongoose|sequelize|knex|sql|insert|update|delete|find|save)\b/i;
const PAYMENT_PATTERNS = /\b(payment|stripe|paypal|checkout|charge|invoice|billing|subscription|plan|price)\b/i;
const ROUTE_PATTERNS = /\b(router|app|route)\.(get|post|put|patch|delete|use|all)\b/i;
const CRITICAL_NAMES = /^(main|bootstrap|init|start|setup|configure|createApp|createServer)\b/i;
function scoreSymbol(name, filePath, bodyText, isExported, paramCount) {
    const reasons = [];
    let score = 0;
    const combined = `${name} ${filePath} ${bodyText}`;
    if (AUTH_PATTERNS.test(combined)) {
        reasons.push('authentication/authorization logic');
        score += 3;
    }
    if (DB_PATTERNS.test(combined)) {
        reasons.push('database operation');
        score += 2;
    }
    if (PAYMENT_PATTERNS.test(combined)) {
        reasons.push('payment logic');
        score += 3;
    }
    if (ROUTE_PATTERNS.test(bodyText)) {
        reasons.push('route handler');
        score += 2;
    }
    if (CRITICAL_NAMES.test(name)) {
        reasons.push('application lifecycle');
        score += 2;
    }
    if (isExported) {
        reasons.push('exported — part of public API');
        score += 1;
    }
    if (paramCount > 3) {
        reasons.push('complex signature');
        score += 1;
    }
    // File path signals
    if (/\/(controllers?|handlers?|routes?)\//i.test(filePath)) {
        reasons.push('controller/route file');
        score += 2;
    }
    if (/\/(services?|usecases?|domain)\//i.test(filePath)) {
        reasons.push('service layer');
        score += 1;
    }
    if (/\/(middleware|guards?)\//i.test(filePath)) {
        reasons.push('middleware');
        score += 1;
    }
    const importance = score >= 5 ? 'critical' :
        score >= 3 ? 'high' :
            score >= 1 ? 'medium' :
                'low';
    return { importance, reasons: reasons.slice(0, 4) };
}
function kindFromFilePath(filePath) {
    if (/\/(controllers?|handlers?)\//i.test(filePath))
        return 'controller';
    if (/\/(services?)\//i.test(filePath))
        return 'service';
    if (/\/(utils?|helpers?|lib)\//i.test(filePath))
        return 'utility';
    return 'function';
}
/** Extract route registrations like `router.get('/path', handler)` */
function extractRoutes(sourceFile, repoRoot) {
    const routes = [];
    const filePath = (0, security_1.relativePath)(repoRoot, sourceFile.getFilePath());
    sourceFile.forEachDescendant((node) => {
        if (node.getKind() !== ts_morph_1.SyntaxKind.CallExpression)
            return;
        const call = node.asKind(ts_morph_1.SyntaxKind.CallExpression);
        if (!call)
            return;
        const expr = call.getExpression();
        const exprText = expr.getText();
        // Match: router.get / app.post / this.router.delete etc.
        const match = exprText.match(/(?:^|\.)(get|post|put|patch|delete|all|use)$/i);
        if (!match)
            return;
        const args = call.getArguments();
        if (args.length === 0)
            return;
        const firstArg = args[0];
        const routePath = firstArg.getKind() === ts_morph_1.SyntaxKind.StringLiteral
            ? firstArg.asKind(ts_morph_1.SyntaxKind.StringLiteral)?.getLiteralValue() ?? firstArg.getText()
            : firstArg.getText();
        // Skip non-path strings (middleware-only registrations)
        if (!routePath.startsWith('/') && !routePath.startsWith("'") && !routePath.startsWith('"'))
            return;
        const method = match[1].toUpperCase();
        const line = node.getStartLineNumber();
        // Try to get handler name
        let handlerName;
        if (args.length >= 2) {
            const lastArg = args[args.length - 1];
            if (lastArg.getKind() === ts_morph_1.SyntaxKind.Identifier) {
                handlerName = lastArg.getText();
            }
        }
        routes.push({ method, path: routePath, filePath, handlerName, line });
    });
    return routes;
}
/**
 * Analyse JavaScript/TypeScript source files in a repository using AST.
 * Returns CodeSymbols and RouteInfo arrays.
 */
function analyzeCode(repoPath, sourceFiles) {
    const symbols = [];
    const routes = [];
    if (sourceFiles.length === 0)
        return { symbols, routes };
    // ts-morph project — we add files manually, no tsconfig needed
    const project = new ts_morph_1.Project({
        useInMemoryFileSystem: false,
        skipAddingFilesFromTsConfig: true,
        compilerOptions: { allowJs: true },
    });
    // Only analyse up to 150 source files to keep performance reasonable
    const filesToAnalyze = sourceFiles.slice(0, 150);
    for (const rel of filesToAnalyze) {
        const abs = path_1.default.join(repoPath, rel);
        try {
            project.addSourceFileAtPath(abs);
        }
        catch {
            // Skip files that fail to parse (binary, unreadable, etc.)
        }
    }
    for (const sourceFile of project.getSourceFiles()) {
        const filePath = (0, security_1.relativePath)(repoPath, sourceFile.getFilePath());
        // ── Routes ────────────────────────────────────────────────────────────────
        routes.push(...extractRoutes(sourceFile, repoPath));
        // ── Functions ─────────────────────────────────────────────────────────────
        sourceFile.getFunctions().forEach((fn) => {
            const name = fn.getName();
            if (!name)
                return; // anonymous
            const body = fn.getBodyText() ?? '';
            const isExported = fn.isExported() || fn.isDefaultExport();
            const params = fn.getParameters().length;
            const { importance, reasons } = scoreSymbol(name, filePath, body, isExported, params);
            const start = fn.getStartLineNumber();
            const end = fn.getEndLineNumber();
            symbols.push({
                name,
                kind: kindFromFilePath(filePath),
                filePath,
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
            if (!name)
                return;
            const isExported = cls.isExported() || cls.isDefaultExport();
            const clsBody = cls.getMembers().map((m) => m.getText()).join(' ');
            const { importance, reasons } = scoreSymbol(name, filePath, clsBody, isExported, 0);
            symbols.push({
                name,
                kind: 'class',
                filePath,
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
                const { importance: mImp, reasons: mReasons } = scoreSymbol(`${name}.${mName}`, filePath, mBody, mExported, mParams);
                symbols.push({
                    name: `${name}.${mName}`,
                    kind: 'method',
                    filePath,
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
            if (!init)
                return;
            if (init.getKind() !== ts_morph_1.SyntaxKind.ArrowFunction &&
                init.getKind() !== ts_morph_1.SyntaxKind.FunctionExpression)
                return;
            const name = decl.getName();
            const varStmt = decl.getVariableStatement();
            const isExported = varStmt ? (varStmt.isExported() || varStmt.isDefaultExport()) : false;
            const body = init.getText();
            const params = init.getKind() === ts_morph_1.SyntaxKind.ArrowFunction
                ? (init.asKind(ts_morph_1.SyntaxKind.ArrowFunction)?.getParameters().length ?? 0)
                : (init.asKind(ts_morph_1.SyntaxKind.FunctionExpression)?.getParameters().length ?? 0);
            const { importance, reasons } = scoreSymbol(name, filePath, body, isExported, params);
            symbols.push({
                name,
                kind: 'arrow_function',
                filePath,
                lineStart: decl.getStartLineNumber(),
                lineEnd: decl.getEndLineNumber(),
                isExported,
                importance,
                importanceReasons: reasons,
                isAsync: init.getKind() === ts_morph_1.SyntaxKind.ArrowFunction
                    ? (init.asKind(ts_morph_1.SyntaxKind.ArrowFunction)?.isAsync() ?? false)
                    : false,
                paramCount: params,
            });
        });
    }
    return { symbols, routes };
}
//# sourceMappingURL=codeAnalyzer.js.map