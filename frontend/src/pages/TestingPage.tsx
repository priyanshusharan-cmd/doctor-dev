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

  const hasNumericCov = testProfile.coverage.percentage !== undefined && testProfile.coverage.percentage !== null;
  const covPct = hasNumericCov ? testProfile.coverage.percentage! : undefined;
  const totalSrc = repositoryProfile.sourceFiles.length;

  let covLabel = hasNumericCov ? `${covPct}%` : 'Percentage unavailable';
  let covSub = '';
  let covDetails = '';

  if (testProfile.coverage.status === 'ACTUAL_COVERAGE') {
    covSub = hasNumericCov ? 'Reported by test runner' : 'Coverage report found';
    covDetails = testProfile.coverage.reason || 'Based on parsed coverage data from the repository.';
  } else if (testProfile.coverage.status === 'EVIDENCE_BASED') {
    covLabel = hasNumericCov ? `${covPct}%` : 'Percentage unavailable';
    covSub = 'No numeric coverage available';
    covDetails = hasNumericCov
      ? `Estimated ${covPct}% based on testing evidence.`
      : (testProfile.coverage.reason || 'Evaluated using structural test evidence, test suites, and AST mappings.');
  } else {
    covLabel = 'Unavailable';
    covSub = 'No coverage data';
    covDetails = testProfile.coverage.reason;
  }

  const mappedFilesCount = result.testMappings.filter((m) => m.relatedTests.length > 0).length;
  const integrationTestCount = testProfile.classifiedTestFiles
    ? testProfile.classifiedTestFiles.filter((f) => f.category === 'integration').reduce((acc, f) => acc + f.testCount, 0)
    : testProfile.suites.filter((s) => /integration|e2e|parallel|sequential/i.test(s.filePath)).reduce((acc, s) => acc + s.testCount, 0);

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

  const barColor = (covPct ?? 0) >= 80 ? 'score-bar-green' : (covPct ?? 0) >= 60 ? 'score-bar-blue' : (covPct ?? 0) >= 40 ? 'score-bar-yellow' : (covPct ?? 0) >= 20 ? 'score-bar-orange' : 'score-bar-red';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Source files',  value: totalSrc.toLocaleString(),                  color: 'text-white'  },
          { label: 'Test files',    value: testProfile.totalTestFiles.toLocaleString(), color: 'text-purple-400' },
          { label: 'Test cases',    value: testProfile.totalTestCount.toLocaleString(), color: 'text-purple-300' },
          { label: 'Gaps found',    value: testGaps.length.toLocaleString(),            color: testGaps.length > 0 ? 'text-orange-400' : 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card rounded-2xl text-center">
            <p className={`text-3xl font-black tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-gray-600 mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Coverage section */}
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
          <span className={`font-black font-mono ${hasNumericCov ? 'text-2xl text-white' : 'text-base text-purple-400'}`}>
            {covLabel}
          </span>
        </div>

        {hasNumericCov ? (
          <div className="h-3 rounded-full bg-gray-800/80 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${covPct}%`, transition: 'width 1s ease-out' }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-3 p-3 rounded-xl bg-gray-900/60 border border-gray-800/60">
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-medium">Test Files</span>
              <span className="text-sm font-bold font-mono text-purple-300">{testProfile.totalTestFiles.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-medium">Detected Tests</span>
              <span className="text-sm font-bold font-mono text-purple-300">{testProfile.totalTestCount.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-medium">Test Mapping</span>
              <span className="text-sm font-bold font-mono text-blue-400">{mappedFilesCount.toLocaleString()} mapped</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-medium">Integration / System</span>
              <span className="text-sm font-bold font-mono text-green-400">{integrationTestCount.toLocaleString()} tests</span>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          {covDetails}
          {testProfile.detectedTestScript && (
            <> Test script: <code className="text-gray-400 font-mono">{testProfile.detectedTestScript}</code></>
          )}
        </p>
      </div>

      {/* Repository-level Test Framework & Execution Model Evidence */}
      {repositoryProfile.testFrameworkEvidence && (
        <div className="card rounded-2xl border border-purple-900/30 bg-purple-950/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-gray-200">Repository Test Execution Model</h3>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-purple-900/40 text-purple-300 border border-purple-700/40">
              {Math.round(repositoryProfile.testFrameworkEvidence.confidence * 100)}% confidence
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-gray-900/60 p-2.5 rounded-xl border border-gray-800/60">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Framework</span>
              <span className="text-sm font-semibold font-mono text-purple-300">
                {repositoryProfile.testFrameworkEvidence.framework}
              </span>
            </div>
            <div className="bg-gray-900/60 p-2.5 rounded-xl border border-gray-800/60">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Execution Model</span>
              <span className="text-sm font-semibold font-mono text-gray-200 capitalize">
                {repositoryProfile.testFrameworkEvidence.executionModel.replace('_', ' ')}
              </span>
            </div>
            <div className="bg-gray-900/60 p-2.5 rounded-xl border border-gray-800/60 col-span-2 md:col-span-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Confidence</span>
              <span className="text-sm font-semibold font-mono text-green-400">
                {Math.round(repositoryProfile.testFrameworkEvidence.confidence * 100)}%
              </span>
            </div>
          </div>

          {repositoryProfile.testFrameworkEvidence.evidence.length > 0 && (
            <div className="pt-2 border-t border-gray-800/40">
              <span className="text-xs font-medium text-gray-400 block mb-1">Evidence:</span>
              <ul className="space-y-1">
                {repositoryProfile.testFrameworkEvidence.evidence.map((ev, idx) => (
                  <li key={idx} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">•</span>
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
                <span className="text-xs flex-shrink-0 hidden sm:block">
                  {s.inheritedFramework ? (
                    <span className="text-gray-500 font-mono text-[11px]" title="Inherited from repository test execution model">
                      {s.framework} <span className="text-[10px] text-gray-600">(repo)</span>
                    </span>
                  ) : (
                    <span className="text-purple-400 font-mono text-[11px]">{s.framework}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
