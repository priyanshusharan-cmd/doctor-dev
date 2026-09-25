import type { AnalysisResult } from '../types';
import { XCircle, Clock, Terminal, FileCode2 } from 'lucide-react';
import { formatDuration, shortPath } from '../lib/utils';

interface Props { result: AnalysisResult }

export default function ValidationPage({ result }: Props) {
  const run = result.testRunResult;
  const generated = result.generatedTests ?? [];

  return (
    <div className="space-y-5">
      {/* Test run */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-gray-200">Test Execution</span>
          {result.testProfile.detectedTestScript && (
            <span className="text-xs text-gray-600 font-mono ml-2">
              script: {result.testProfile.detectedTestScript}
            </span>
          )}
        </div>

        {!run || run.status === 'not_run' ? (
          <div className="text-center py-8">
            <Terminal className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Tests were not run during this analysis.</p>
            <p className="text-xs text-gray-600 mt-1">
              Enable <span className="text-gray-400 font-medium">Run existing tests</span> and re-analyse to see results.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card text-center py-3">
                <p className={`text-2xl font-bold ${run.status === 'passed' ? 'text-green-400' : 'text-red-400'}`}>
                  {run.status === 'passed' ? '✓' : '✗'}
                </p>
                <p className="text-xs text-gray-500 mt-1">{run.status}</p>
              </div>
              <div className="card text-center py-3">
                <p className="text-2xl font-bold text-green-400 tabular-nums">{run.passed}</p>
                <p className="text-xs text-gray-500 mt-1">passed</p>
              </div>
              <div className="card text-center py-3">
                <p className={`text-2xl font-bold tabular-nums ${run.failed > 0 ? 'text-red-400' : 'text-white'}`}>{run.failed}</p>
                <p className="text-xs text-gray-500 mt-1">failed</p>
              </div>
              <div className="card text-center py-3">
                <div className="flex items-center justify-center gap-1 text-gray-400 mb-1"><Clock className="w-4 h-4" /></div>
                <p className="text-sm font-mono text-gray-300 tabular-nums">{formatDuration(run.duration)}</p>
                <p className="text-xs text-gray-500">duration</p>
              </div>
            </div>

            <div className="bg-gray-950 rounded border border-gray-800 p-2 text-xs font-mono text-gray-500">
              $ {run.command}
            </div>

            {run.failures.length > 0 && (
              <div>
                <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-red-400" /> Failed Tests ({run.failures.length})
                </h4>
                <div className="space-y-2">
                  {run.failures.map((t, i) => (
                    <div key={i} className="border border-red-900 bg-red-950/30 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-300 mb-1">{t.name}</p>
                      <pre className="text-xs text-red-400/80 font-mono whitespace-pre-wrap overflow-x-auto">{t.error}</pre>
                      {t.file && <p className="text-xs text-gray-600 font-mono mt-2">{shortPath(t.file)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {run.stdout && (
              <div>
                <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">Output</h4>
                <pre className="text-xs font-mono text-gray-400 bg-gray-950 border border-gray-800 rounded-lg p-4 overflow-x-auto max-h-80 whitespace-pre-wrap">
                  {run.stdout}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generated tests */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <FileCode2 className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-gray-200">Generated Test Skeletons</span>
          <span className="ml-auto text-xs text-gray-600">{generated.length} file(s)</span>
        </div>

        {generated.length === 0 ? (
          <div className="text-center py-8">
            <FileCode2 className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No tests were generated.</p>
            <p className="text-xs text-gray-600 mt-1">
              Enable <span className="text-gray-400 font-medium">Generate test suggestions</span> and re-analyse.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {generated.map((t) => (
              <div key={t.filePath} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/50 border-b border-gray-800">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs font-mono text-gray-300">{t.filePath}</span>
                  </div>
                  <span className="text-xs text-gray-600">{t.framework}</span>
                </div>
                <pre className="text-xs font-mono text-gray-300 bg-gray-950 p-4 overflow-x-auto max-h-64 whitespace-pre">
                  {t.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
