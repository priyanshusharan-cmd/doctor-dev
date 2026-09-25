import type { Analysis, AnalysisStatus, AnalysisResult } from '../types';
export declare function createAnalysis(repositoryPath: string): Analysis;
export declare function getAnalysis(id: string): Analysis | undefined;
export declare function listAnalyses(): Analysis[];
export declare function setStatus(id: string, status: AnalysisStatus): void;
export declare function setResult(id: string, result: AnalysisResult): void;
export declare function setError(id: string, error: string): void;
