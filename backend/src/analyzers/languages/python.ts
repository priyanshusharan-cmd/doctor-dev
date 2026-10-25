import path from 'path';
import fs from 'fs';
import { LanguageAdapter, ParseResult } from './index';
import { readFileSafe, relativePath } from '../../utils/security';
import { getSourceType } from '../codeAnalyzer';
import { scoreImportance } from '../importance';
import type { TestProfile, TestSuite, CodeSymbol, RouteInfo, SymbolImportance, SourceType } from '../../types';

function importanceOf(name: string, filePath: string, isExported: boolean, sourceType: SourceType, isRouteHandler: boolean): { importance: SymbolImportance; importanceReasons: string[] } {
  const { importance, reasons } = scoreImportance({ name, filePath, body: '', isExported, sourceType, isRouteHandler });
  return { importance, importanceReasons: reasons };
}

export const PythonAdapter: LanguageAdapter = {
  language: 'python',

  canAnalyze(repoPath: string, sourceFiles: string[]): boolean {
    return sourceFiles.some((f) => f.endsWith('.py'));
  },

  analyzeCode(repoPath: string, sourceFiles: string[]): ParseResult {
    const symbols: CodeSymbol[] = [];
    const routes: RouteInfo[] = [];

    const pyFiles = sourceFiles.filter((f) => f.endsWith('.py')).slice(0, 150);

    for (const rel of pyFiles) {
      const abs = path.join(repoPath, rel);
      const content = readFileSafe(abs);
      if (!content) continue;

      const sourceType = getSourceType(rel);
      const lines = content.split('\n');

      let currentClass: string | null = null;
      let classIndent = -1;
      let underRouteDecorator = false;
      let inDocstring = false;

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const trimmed = line.trim();
        const indent = line.length - line.trimStart().length;

        // Code examples inside docstrings ("@app.route('/')") are not real definitions
        const quotes = (trimmed.match(/"""|'''/g) ?? []).length;
        if (inDocstring) {
          if (quotes % 2 === 1) inDocstring = false;
          return;
        }
        if (quotes % 2 === 1) {
          inDocstring = true;
          return;
        }

        // Leaving the class body: any code at or above the class's own indentation ends it.
        // Blank lines, comments, and decorators don't end a class body.
        if (currentClass && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('@') && indent <= classIndent) {
          currentClass = null;
          classIndent = -1;
        }

        // 1. Class definition: class Foo(Bar):
        const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?:/);
        if (classMatch) {
          const className = classMatch[1];
          currentClass = className;
          classIndent = indent;
          symbols.push({
            name: className,
            kind: 'class',
            filePath: rel,
            sourceType,
            lineStart: lineNum,
            lineEnd: lineNum,
            isExported: !className.startsWith('_'),
            ...importanceOf(className, rel, !className.startsWith('_'), sourceType, false),
            isAsync: false,
            paramCount: 0,
          });
          return;
        }

        // 2. Function / Method definition: def foo(bar, baz): or async def foo(...):
        const fnMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
        if (fnMatch) {
          const fnName = fnMatch[1];
          const rawParams = fnMatch[2].split(',').map((p) => p.trim()).filter((p) => p && p !== 'self' && p !== 'cls');
          const isAsync = trimmed.startsWith('async ');
          const isPrivate = fnName.startsWith('_') && !fnName.startsWith('__init__');

          const scored = importanceOf(currentClass ? `${currentClass}.${fnName}` : fnName, rel, !isPrivate, sourceType, underRouteDecorator);
          underRouteDecorator = false;

          symbols.push({
            name: currentClass ? `${currentClass}.${fnName}` : fnName,
            kind: currentClass ? 'method' : 'function',
            filePath: rel,
            sourceType,
            lineStart: lineNum,
            lineEnd: lineNum,
            isExported: !isPrivate,
            ...scored,
            isAsync,
            paramCount: rawParams.length,
          });
          return;
        }

        // 3. Flask / FastAPI / Django Route decorators:
        // @app.route('/api/users', methods=['GET', 'POST'])
        // @router.get('/api/users')
        const routeMatch = trimmed.match(/^@(?:app|router|api)\.(get|post|put|delete|patch|route)\s*\(\s*['"]([^'"]+)['"]/i);
        if (routeMatch) {
          const methodOrRoute = routeMatch[1].toUpperCase();
          const routePath = routeMatch[2];
          let method = methodOrRoute === 'ROUTE' ? 'GET' : methodOrRoute;

          const methodOverride = trimmed.match(/methods\s*=\s*\[\s*['"]([A-Za-z]+)['"]/i);
          if (methodOverride) method = methodOverride[1].toUpperCase();

          underRouteDecorator = true;
          routes.push({
            method,
            path: routePath,
            filePath: rel,
            sourceType,
            line: lineNum,
          });
        }
      });
    }

    return { symbols, routes };
  },

  analyzeTests(repoPath: string, testFiles: string[]): TestProfile {
    const suites: TestSuite[] = [];
    const coveredFiles = new Set<string>();
    let totalTestCount = 0;

    const pyTestFiles = testFiles.filter((f) => f.endsWith('.py'));

    for (const rel of pyTestFiles) {
      const abs = path.join(repoPath, rel);
      const content = readFileSafe(abs);
      if (!content) continue;

      const testFnMatches = content.match(/^\s*def\s+test_[a-zA-Z0-9_]+/gm);
      const testCount = testFnMatches ? testFnMatches.length : (/\bassert\b/.test(content) ? 1 : 0);
      totalTestCount += testCount;

      suites.push({
        filePath: rel,
        framework: 'pytest',
        testCount,
        describeBlocks: [],
        itBlocks: testFnMatches ? testFnMatches.map((m) => m.replace(/^\s*def\s+/, '')) : [],
        importsUnder: [],
      });
    }

    // Check coverage files
    let coverage: { status: 'ACTUAL_COVERAGE' | 'EVIDENCE_BASED' | 'UNAVAILABLE'; percentage?: number; reason: string } = {
      status: pyTestFiles.length > 0 ? 'EVIDENCE_BASED' : 'UNAVAILABLE',
      reason: pyTestFiles.length > 0
        ? `Found ${pyTestFiles.length} Python test file(s) with ${totalTestCount} test case(s).`
        : 'No Python test files detected.',
    };

    if (fs.existsSync(path.join(repoPath, 'coverage.xml'))) {
      coverage = {
        status: 'ACTUAL_COVERAGE',
        reason: 'Found coverage.xml report in repository.',
      };
    }

    return {
      totalTestFiles: pyTestFiles.length,
      totalTestCount,
      totalTestSuites: suites.length,
      suites,
      coveredFiles,
      coverage,
    };
  },
};
