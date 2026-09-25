import type { CodeSymbol, RouteInfo, TestProfile, SourceType } from '../../types';

export interface ParseResult {
  symbols: CodeSymbol[];
  routes: RouteInfo[];
}

export interface LanguageAdapter {
  /** The language this adapter handles */
  language: string;
  
  /** Return true if this adapter can analyze the given repository */
  canAnalyze(repoPath: string, sourceFiles: string[]): boolean;
  
  /** Parse source files to extract symbols and routes */
  analyzeCode(repoPath: string, sourceFiles: string[]): ParseResult;
  
  /** Parse test files and coverage data to build a test profile */
  analyzeTests(repoPath: string, testFiles: string[]): TestProfile;
}

import { JavaScriptAdapter } from './javascript';
import { PythonAdapter } from './python';

// Registry of all available language adapters
const adapters: LanguageAdapter[] = [JavaScriptAdapter, PythonAdapter];

export function registerAdapter(adapter: LanguageAdapter) {
  adapters.push(adapter);
}

export function getAdapterFor(repoPath: string, sourceFiles: string[]): LanguageAdapter | undefined {
  return adapters.find((a) => a.canAnalyze(repoPath, sourceFiles));
}

export function getAllAdaptersFor(repoPath: string, sourceFiles: string[]): LanguageAdapter[] {
  return adapters.filter((a) => a.canAnalyze(repoPath, sourceFiles));
}

