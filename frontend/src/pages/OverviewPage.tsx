import HealthScoreCard from '../components/HealthScoreCard';
import RepoOverviewCard from '../components/RepoOverviewCard';
import type { AnalysisResult } from '../types';
import { FlaskConical, Settings2, Clock, AlertTriangle, TrendingUp, ArrowRight, Layers } from 'lucide-react';
import { severityBadgeClass } from '../lib/utils';

interface Props {
  result: AnalysisResult;
  onTabChange: (tab: 'testing' | 'configuration') => void;
}

function MetricCard({ label, value, sub, color = 'text-white', bgColor = '', onClick }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  bgColor?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`card rounded-2xl text-left w-full group transition-all duration-200 ${
        onClick ? 'hover:border-gray-700 cursor-pointer hover:-translate-y-0.5' : 'cursor-default'
      } ${bgColor}`}
    >
      <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-3xl font-black tabular-nums leading-none ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1.5 font-medium">{sub}</p>}
      {onClick && (
        <div className="flex items-center gap-1 mt-3 text-xs text-gray-600 group-hover:text-blue-400 transition-colors">
          <span>View details</span>
          <ArrowRight className="w-3 h-3" />
        </div>
      )}
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
    <div className="space-y-6 animate-fade-in">
      {/* Top section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2"><HealthScoreCard score={healthScore} /></div>
        <div className="lg:col-span-3"><RepoOverviewCard meta={meta} /></div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Testing Gaps"
          value={testGaps.length}
          sub={criticalGaps > 0 ? `${criticalGaps} critical` : 'None critical'}
          color={criticalGaps > 0 ? 'text-red-400' : testGaps.length > 0 ? 'text-orange-400' : 'text-green-400'}
          onClick={() => onTabChange('testing')}
        />
        <MetricCard
          label="Config Issues"
          value={configHealth.issues.length}
          sub={criticalIssues > 0 ? `${criticalIssues} critical` : 'None critical'}
          color={criticalIssues > 0 ? 'text-red-400' : configHealth.issues.length > 0 ? 'text-yellow-400' : 'text-green-400'}
          onClick={() => onTabChange('configuration')}
        />
        <MetricCard
          label="Test Coverage"
          value={`${covPct}%`}
          sub={`${testProfile.coveredFiles.length} of ${meta.sourceFiles.length} files`}
          color={covPct >= 70 ? 'text-green-400' : covPct >= 40 ? 'text-yellow-400' : 'text-red-400'}
        />
        <MetricCard
          label="Untested Routes"
          value={untestedRoutes}
          sub={`of ${routes.length} API routes`}
          color={untestedRoutes === 0 ? 'text-green-400' : 'text-orange-400'}
        />
      </div>

      {/* Priority findings */}
      {priorityFindings.length > 0 && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-gray-200">Priority Findings</h3>
            <span className="text-xs text-gray-600 ml-auto">{priorityFindings.length} items</span>
          </div>
          <div className="space-y-2">
            {priorityFindings.map((f) => (
              <div key={f.id} className="card rounded-xl flex items-start gap-4 group hover:border-gray-700 transition-colors duration-150">
                <div className="mt-0.5 flex-shrink-0">
                  <span className={severityBadgeClass(f.level)}>{f.level.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-100 mb-1">{f.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{f.description}</p>
                  <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-gray-800/40 border border-gray-700/30">
                    <TrendingUp className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-500 leading-relaxed">{f.recommendation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Test health summary */}
        <div className="card rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-950/50 border border-purple-800/40 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-sm font-bold text-gray-200">TestPilot Summary</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-2xl font-black text-white tabular-nums">{testGaps.length}</p>
              <p className="text-xs text-gray-600 mt-0.5">gaps found</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-white tabular-nums">{testProfile.totalTestFiles}</p>
              <p className="text-xs text-gray-600 mt-0.5">test files</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-white tabular-nums">{covPct}%</p>
              <p className="text-xs text-gray-600 mt-0.5">coverage</p>
            </div>
          </div>
          {/* mini severity row */}
          <div className="flex gap-2 flex-wrap">
            {(['critical', 'high', 'medium', 'low'] as const).map((s) => {
              const n = testGaps.filter((g) => g.severity === s).length;
              return n > 0 ? (
                <span key={s} className={`text-xs px-2 py-0.5 rounded border font-medium ${
                  s === 'critical' ? 'text-red-400 border-red-800/60 bg-red-950/30' :
                  s === 'high' ? 'text-orange-400 border-orange-800/60 bg-orange-950/30' :
                  s === 'medium' ? 'text-yellow-400 border-yellow-800/60 bg-yellow-950/30' :
                  'text-gray-500 border-gray-700/60 bg-gray-800/30'
                }`}>{n} {s}</span>
              ) : null;
            })}
          </div>
          {testProfile.detectedTestScript && (
            <p className="text-xs text-gray-700 mt-3 font-mono">script: {testProfile.detectedTestScript}</p>
          )}
        </div>

        {/* Config health summary */}
        <div className="card rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/50 border border-cyan-800/40 flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-sm font-bold text-gray-200">ConfigDoctor Summary</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mb-4">{configHealth.summary}</p>
          {/* Presence chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '.env.example', present: configHealth.hasEnvExample },
              { label: 'dotenv', present: configHealth.hasDotenv },
              { label: `${configHealth.dockerfiles.length} Dockerfile`, present: configHealth.dockerfiles.length > 0 },
              { label: `${configHealth.ciFiles.length} CI file`, present: configHealth.ciFiles.length > 0 },
            ].map(({ label, present }) => (
              <span key={label} className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                present
                  ? 'bg-green-950/30 text-green-400 border-green-800/40'
                  : 'bg-gray-800/30 text-gray-600 border-gray-700/40'
              }`}>
                {present ? '✓' : '✗'} {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-gray-700 justify-end">
        <Clock className="w-3.5 h-3.5" />
        <span>Analysed {new Date(result.scannedAt).toLocaleString()}</span>
        <span className="text-gray-800">·</span>
        <Layers className="w-3.5 h-3.5" />
        <span>{meta.totalFiles} files</span>
      </div>
    </div>
  );
}
