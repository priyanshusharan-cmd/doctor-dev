import { LanguageAdapter, ParseResult } from './index';
import { analyzeCode } from '../codeAnalyzer';
import { analyzeTests } from '../configAnalyzer';
import type { TestProfile } from '../../types';

export const JavaScriptAdapter: LanguageAdapter = {
  language: 'javascript/typescript',
  
  canAnalyze(repoPath: string, sourceFiles: string[]): boolean {
    return sourceFiles.some((f) => /\.(js|jsx|ts|tsx)$/.test(f));
  },
  
  analyzeCode(repoPath: string, sourceFiles: string[]): ParseResult {
    return analyzeCode(repoPath, sourceFiles);
  },
  
  analyzeTests(repoPath: string, testFiles: string[]): TestProfile {
    return analyzeTests(repoPath, testFiles);
  }
};
