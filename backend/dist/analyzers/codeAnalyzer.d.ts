import type { CodeSymbol, RouteInfo, SourceType } from '../types';
export declare function getSourceType(filePath: string): SourceType;
/**
 * Analyse JavaScript/TypeScript source files in a repository using AST.
 * Returns CodeSymbols and RouteInfo arrays.
 */
export declare function analyzeCode(repoPath: string, sourceFiles: string[]): {
    symbols: CodeSymbol[];
    routes: RouteInfo[];
};
