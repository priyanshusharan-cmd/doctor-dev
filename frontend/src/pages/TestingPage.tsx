import TestGapCard from '../components/TestGapCard';
import type { AnalysisResult } from '../types';
import { FlaskConical, Route, FileX, FileCode2 } from 'lucide-react';
import { scoreBarColor, shortPath } from '../lib/utils';

interface Props { result: AnalysisResult }

export default function TestingPage({ result }: Props) {
  const { testProfile, testGaps, generatedTests, routes, repositoryProfile } = result;

  const coveredCount = testProfile.coveredFiles.length;
  const totalSrc = repositoryProfile.sourceFiles.length;
  const covPct = totalSrc > 0 ? Math.round((coveredCount / totalSrc) * 100) : 0;

  const untestedRoutes = routes.filter((r) =>
    !result.testMappings.find((m) => m.sourceFile === r.filePath && m.relatedTests.length > 0)
  );

  const bySeverity = {
    critical: testGaps.filter((g) => g.severity === 'critical').length,
    high:     testGaps.filter((g) => g.severity === 'high').length,
    medium:   testGaps.filter((g) => g.severity === 'medium').length,
    low:      testGaps.filter((g) => g.severity === 'low').length,
  };

  return (
    <div className="space-y-5">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Source files', value: totalSrc },
          { label: 'Test files', value: testProfile.totalTestFiles },
          { label: 'Test cases', value: testProfile.totalTestCount },
          { label: 'Gaps found', value: testGaps.length },
        ].map(({ label, value }) => (
          <div key={label} className="card text-center">
            <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-gray-200">File Coverage (heuristic)</span>
          </div>
          <span className="text-sm font-mono text-gray-300 tabular-nums">{covPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full ${scoreBarColor(covPct)}`} style={{ width: `${covPct}%` }} />
        </div>
        <p className="text-xs text-gray-600 mt-2">
          {coveredCount} of {totalSrc} source files have detectable test coverage.
          {testProfile.detectedTestScript && ` Test script: ${testProfile.detectedTestScript}`}
        </p>
      </div>

      {/* Severity breakdown */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {(Object.entries(bySeverity) as [string, number][]).map(([sev, count]) => (
          <div key={sev} className="card py-3">
            <p className="text-xl font-bold tabular-nums text-white">{count}</p>
            <p className={`text-xs mt-0.5 font-medium ${
              sev === 'critical' ? 'text-red-400' : sev === 'high' ? 'text-orange-400' :
              sev === 'medium'   ? 'text-yellow-400' : 'text-gray-500'
            }`}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</p>
          </div>
        ))}
      </div>

      {/* Gaps list */}
      {testGaps.length === 0 ? (
        <div className="card text-center py-10">
          <FlaskConical className="w-8 h-8 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-green-400">No testing gaps found</p>
        </div>
      ) : (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
            Testing Gaps ({testGaps.length})
          </h3>
          <div className="space-y-2">
            {testGaps.map((gap) => <TestGapCard key={gap.id} gap={gap} />)}
          </div>
        </div>
      )}

      {/* Untested routes */}
      {untestedRoutes.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
            <Route className="w-3.5 h-3.5" />
            Untested API Routes ({untestedRoutes.length})
          </h3>
          <div className="card divide-y divide-gray-800">
            {untestedRoutes.map((route, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className={`text-xs font-mono font-bold w-14 ${
                  route.method === 'GET' ? 'text-green-400' : route.method === 'POST' ? 'text-blue-400' :
                  route.method === 'DELETE' ? 'text-red-400' : 'text-yellow-400'
                }`}>{route.method}</span>
                <span className="text-sm font-mono text-gray-300 flex-1">{route.path}</span>
                <span className="text-xs text-gray-600 font-mono hidden sm:block">{shortPath(route.filePath)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated tests */}
      {generatedTests.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
            <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
            Generated Test Skeletons ({generatedTests.length})
          </h3>
          <div className="space-y-3">
            {generatedTests.map((t) => (
              <div key={t.filePath} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/50 border-b border-gray-800">
                  <span className="text-xs font-mono text-gray-300">{t.filePath}</span>
                  <span className="text-xs text-gray-600">{t.framework}</span>
                </div>
                <pre className="text-xs font-mono text-gray-300 bg-gray-950 p-4 overflow-x-auto max-h-48 whitespace-pre">
                  {t.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test suites */}
      {testProfile.suites.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
            <FileX className="w-3.5 h-3.5" />
            Existing Test Files ({testProfile.suites.length})
          </h3>
          <div className="card divide-y divide-gray-800 max-h-64 overflow-y-auto">
            {testProfile.suites.map((s) => (
              <div key={s.filePath} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-xs font-mono text-gray-400 flex-1 truncate">{s.filePath}</span>
                <span className="text-xs text-gray-600">{s.testCount} test{s.testCount !== 1 ? 's' : ''}</span>
                <span className="text-xs text-gray-700">{s.framework}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
