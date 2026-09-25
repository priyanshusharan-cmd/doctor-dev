import TestGapCard from '../components/TestGapCard';
import type { AnalysisResult } from '../types';
import { FlaskConical, Route, FileCode2, SortAsc } from 'lucide-react';
import { shortPath } from '../lib/utils';
import { useState } from 'react';

interface Props { result: AnalysisResult }

type SortBy = 'severity' | 'confidence' | 'category';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function TestingPage({ result }: Props) {
  const { testProfile, testGaps, generatedTests, routes, repositoryProfile } = result;
  const [sortBy, setSortBy] = useState<SortBy>('severity');
  const [showGenerated, setShowGenerated] = useState(false);

  const covPct = testProfile.coverage.percentage ?? 0;
  const totalSrc = repositoryProfile.sourceFiles.length;

  let covLabel = `${covPct}%`;
  let covSub = '';
  let covDetails = '';

  if (testProfile.coverage.status === 'ACTUAL_COVERAGE') {
    covSub = 'Reported by test runner';
    covDetails = `Based on parsed coverage data from the repository.`;
  } else if (testProfile.coverage.status === 'EVIDENCE_BASED') {
    covLabel = 'Evidence-based';
    covSub = 'Estimated from tests';
    covDetails = `Estimated ${covPct}% based on testing evidence.`;
  } else {
    covLabel = 'Unavailable';
    covSub = 'No coverage data';
    covDetails = testProfile.coverage.reason;
  }

  const untestedRoutes = routes.filter((r) =>
    !result.testMappings.find((m) => m.sourceFile === r.filePath && m.relatedTests.length > 0)
  );

  const sortedGaps = [...testGaps].sort((a, b) => {
    if (sortBy === 'severity') return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sortBy === 'confidence') return b.confidence - a.confidence;
    return a.category.localeCompare(b.category);
  });

  const bySeverity = {
    critical: testGaps.filter((g) => g.severity === 'critical').length,
    high:     testGaps.filter((g) => g.severity === 'high').length,
    medium:   testGaps.filter((g) => g.severity === 'medium').length,
    low:      testGaps.filter((g) => g.severity === 'low').length,
  };

  const barColor = covPct >= 80 ? 'score-bar-green' : covPct >= 60 ? 'score-bar-blue' : covPct >= 40 ? 'score-bar-yellow' : covPct >= 20 ? 'score-bar-orange' : 'score-bar-red';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Source files',  value: totalSrc,                      color: 'text-white'  },
          { label: 'Test files',    value: testProfile.totalTestFiles,     color: 'text-purple-400' },
          { label: 'Test cases',    value: testProfile.totalTestCount,     color: 'text-purple-300' },
          { label: 'Gaps found',    value: testGaps.length,                color: testGaps.length > 0 ? 'text-orange-400' : 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card rounded-2xl text-center">
            <p className={`text-3xl font-black tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-gray-600 mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div className="card rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-950/50 border border-purple-800/40 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-gray-200">File Coverage</span>
              <span className="text-xs text-gray-600 ml-2">({covSub})</span>
            </div>
          </div>
          <span className="text-2xl font-black text-white font-mono">{covLabel}</span>
        </div>
        <div className="h-3 rounded-full bg-gray-800/80 overflow-hidden mb-2">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${covPct}%`, transition: 'width 1s ease-out' }}
          />
        </div>
        <p className="text-xs text-gray-600">
          {covDetails}
          {testProfile.detectedTestScript && (
            <> Test script: <code className="text-gray-400 font-mono">{testProfile.detectedTestScript}</code></>
          )}
        </p>
      </div>

      {/* Severity breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(bySeverity) as [string, number][]).map(([sev, count]) => (
          <div key={sev} className="card rounded-2xl text-center py-4">
            <p className={`text-2xl font-black tabular-nums ${
              sev === 'critical' ? 'text-red-400' :
              sev === 'high'     ? 'text-orange-400' :
              sev === 'medium'   ? 'text-yellow-400' : 'text-gray-500'
            }`}>{count}</p>
            <p className="text-xs mt-1 text-gray-600 font-medium capitalize">{sev}</p>
          </div>
        ))}
      </div>

      {/* Gaps list */}
      {testGaps.length === 0 ? (
        <div className="card rounded-2xl text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-green-950/40 border border-green-800/30 flex items-center justify-center mx-auto mb-4">
            <FlaskConical className="w-7 h-7 text-green-400" />
          </div>
          <p className="text-base font-bold text-green-400 mb-1">No testing gaps found</p>
          <p className="text-sm text-gray-600">All important code paths have detectable test coverage.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-bold text-gray-200">
              Testing Gaps <span className="text-gray-600 font-normal">({testGaps.length})</span>
            </h3>
            <div className="ml-auto flex items-center gap-1">
              <SortAsc className="w-3.5 h-3.5 text-gray-600" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="text-xs bg-gray-800/60 border border-gray-700/50 rounded-lg px-2 py-1 text-gray-400 focus:outline-none"
              >
                <option value="severity">By severity</option>
                <option value="confidence">By confidence</option>
                <option value="category">By category</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {sortedGaps.map((gap) => <TestGapCard key={gap.id} gap={gap} />)}
          </div>
        </div>
      )}

      {/* Untested routes */}
      {untestedRoutes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Route className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-gray-200">
              Untested API Routes <span className="text-gray-600 font-normal">({untestedRoutes.length} of {routes.length})</span>
            </h3>
          </div>
          <div className="card rounded-2xl divide-y divide-gray-800/50">
            {untestedRoutes.map((route, i) => (
              <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`text-xs font-bold font-mono w-16 flex-shrink-0 ${
                  route.method === 'GET'    ? 'text-green-400' :
                  route.method === 'POST'   ? 'text-blue-400' :
                  route.method === 'PUT'    ? 'text-yellow-400' :
                  route.method === 'PATCH'  ? 'text-orange-400' :
                  route.method === 'DELETE' ? 'text-red-400' : 'text-gray-400'
                }`}>{route.method}</span>
                <span className="text-sm font-mono text-gray-200 flex-1">{route.path}</span>
                <span className="text-xs text-gray-700 font-mono hidden sm:block">{shortPath(route.filePath)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated tests toggle */}
      {generatedTests.length > 0 && (
        <div>
          <button
            onClick={() => setShowGenerated(!showGenerated)}
            className="flex items-center gap-2 mb-3 group"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-950/40 border border-purple-800/30 flex items-center justify-center">
              <FileCode2 className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">
              Generated Test Skeletons <span className="text-gray-600 font-normal">({generatedTests.length})</span>
            </h3>
            <span className="text-xs text-gray-600 ml-1">{showGenerated ? '▲ hide' : '▼ show'}</span>
          </button>
          {showGenerated && (
            <div className="space-y-3 animate-fade-in">
              {generatedTests.map((t) => (
                <div key={t.filePath} className="rounded-xl overflow-hidden border border-gray-800/60">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-800/40 border-b border-gray-800/50">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-mono text-gray-300">{t.filePath}</span>
                    </div>
                    <span className="text-xs text-gray-600 bg-gray-800/60 border border-gray-700/30 px-2 py-0.5 rounded">{t.framework}</span>
                  </div>
                  <pre className="code-block rounded-none text-gray-300 max-h-56 whitespace-pre leading-relaxed">
                    {t.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing test files */}
      {testProfile.suites.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-200 mb-3">
            Existing Test Files <span className="text-gray-600 font-normal">({testProfile.suites.length})</span>
          </h3>
          <div className="card rounded-2xl divide-y divide-gray-800/50 max-h-72 overflow-y-auto">
            {testProfile.suites.map((s) => (
              <div key={s.filePath} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-xs font-mono text-gray-400 flex-1 truncate">{s.filePath}</span>
                <span className="text-xs text-gray-600 flex-shrink-0">{s.testCount} test{s.testCount !== 1 ? 's' : ''}</span>
                <span className="text-xs text-gray-700 flex-shrink-0 hidden sm:block">{s.framework}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
