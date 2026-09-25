/**
 * Start a full analysis.  Returns the analysisId immediately.
 * Analysis runs in the background — poll /api/analysis/:id for status.
 */
export declare function startAnalysis(rawPath: string, opts?: {
    runTests?: boolean;
    generateTests?: boolean;
}): Promise<string>;
