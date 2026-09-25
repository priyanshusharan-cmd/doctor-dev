import type { CodeSymbol, RouteInfo } from '../types';
/**
 * Analyse JavaScript/TypeScript source files in a repository using AST.
 * Returns CodeSymbols and RouteInfo arrays.
 */
export declare function analyzeCode(repoPath: string, sourceFiles: string[]): {
    symbols: CodeSymbol[];
    routes: RouteInfo[];
};
