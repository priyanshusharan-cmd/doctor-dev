import HealthScoreCard from '../components/HealthScoreCard';
import RepoOverviewCard from '../components/RepoOverviewCard';
import type { AnalysisResult } from '../types';
import { FlaskConical, Settings2, Clock, AlertTriangle } from 'lucide-react';
import { severityBadgeClass } from '../lib/utils';

interface Props {
  result: AnalysisResult;
  onTabChange: (tab: 'testing' | 'configuration') => void;
}

function StatCard({ label, value, sub, color = 'text-white', onClick }: {
  label: string; value: string | number; sub?: string; color?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`card text-left w-full ${onClick ? 'hover:border-gray-700 cursor-pointer transition-colors' : 'cursor-default'}`}
    >
      <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </button>
  );
}

export default function OverviewPage({ result, onTabChange }: Props) {
  const { repositoryProfile: meta, testProfile, configHealth, healthScore, priorityFindings, testGaps, routes } = result;

  const criticalGaps = testGaps.filter((g) => g.severity === 'critical').length;
  const criticalIssues = configHealth.issues.filter((i) => i.severity === 'critical').length;
  const untestedRoutes = routes.filter((r) =>
    !result.testMappings.find((m) => m.sourceFile === r.filePath && m.relatedTests.length > 0)
  ).length;

  const covPct = meta.sourceFiles.length > 0
    ? Math.round((result.testProfile.coveredFiles.length / Math.max(meta.sourceFiles.length, 1)) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HealthScoreCard score={healthScore} />
        <div className="lg:col-span-2"><RepoOverviewCard meta={meta} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Testing gaps" value={testGaps.length}
          sub={criticalGaps > 0 ? `${criticalGaps} critical` : 'None critical'}
          color={criticalGaps > 0 ? 'text-red-400' : 'text-white'}
          onClick={() => onTabChange('testing')}
        />
        <StatCard
          label="Config issues" value={configHealth.issues.length}
          sub={criticalIssues > 0 ? `${criticalIssues} critical` : 'None critical'}
          color={criticalIssues > 0 ? 'text-red-400' : 'text-white'}
          onClick={() => onTabChange('configuration')}
        />
        <StatCard
          label="Test files" value={testProfile.totalTestFiles}
          sub={`${testProfile.totalTestCount} test cases`}
          color={testProfile.totalTestFiles > 0 ? 'text-green-400' : 'text-orange-400'}
        />
        <StatCard
          label="Untested routes" value={untestedRoutes}
          sub={`of ${routes.length} routes`}
          color={untestedRoutes > 0 ? 'text-orange-400' : 'text-green-400'}
        />
      </div>

      {/* Priority findings */}
      {priorityFindings.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            Priority Findings ({priorityFindings.length})
          </h3>
          <div className="space-y-2">
            {priorityFindings.map((f) => (
              <div key={f.id} className="card flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 ${severityBadgeClass(f.level)}`}>{f.level.toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 mb-0.5">{f.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{f.description}</p>
                  <p className="text-xs text-gray-600 mt-1.5">{f.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-gray-200">Test Health</span>
          </div>
          <div className="flex gap-4 mb-3">
            <div><p className="text-2xl font-bold text-white tabular-nums">{testGaps.length}</p><p className="text-xs text-gray-500">gaps found</p></div>
            <div><p className="text-2xl font-bold text-white tabular-nums">{testProfile.totalTestFiles}</p><p className="text-xs text-gray-500">test files</p></div>
            <div><p className="text-2xl font-bold text-white tabular-nums">{covPct}%</p><p className="text-xs text-gray-500">file coverage</p></div>
          </div>
          {testProfile.detectedTestScript && (
            <p className="text-xs text-gray-500 font-mono">Test script: <span className="text-gray-400">{testProfile.detectedTestScript}</span></p>
          )}
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-gray-200">Configuration Health</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{configHealth.summary}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs text-gray-600">
        <Clock className="w-3.5 h-3.5" />
        <span>Analysed {new Date(result.scannedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
