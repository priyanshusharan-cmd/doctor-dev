import type { AnalysisResult } from '../types';
import { gradeColor, severityBadgeClass } from '../lib/utils';
import { Shield, Download, Clock } from 'lucide-react';
import HealthScoreCard from '../components/HealthScoreCard';

interface Props { result: AnalysisResult }

export default function ReportPage({ result }: Props) {
  const { repositoryProfile: meta, testProfile, configHealth, priorityFindings, healthScore, testGaps } = result;

  function downloadJson() {
    // Serialize — replace Set with Array
    const serializable = {
      ...result,
      testProfile: { ...result.testProfile, coveredFiles: Array.from(result.testProfile.coveredFiles) },
    };
    const blob = new Blob([JSON.stringify(serializable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctor-dev-report-${meta.name}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown() {
    const lines: string[] = [
      `# Doctor Dev Health Report — ${meta.name}`,
      ``,
      `**Generated:** ${new Date(result.scannedAt).toLocaleString()}  `,
      `**Analysis ID:** ${result.analysisId}`,
      ``,
      `## Health Score`,
      ``,
      `| Dimension | Score |`,
      `|-----------|-------|`,
      `| Overall | ${healthScore.overall}/100 (${healthScore.grade}) |`,
      `| Testing | ${healthScore.testing}/100 |`,
      `| Configuration | ${healthScore.configuration}/100 |`,
      `| Security | ${healthScore.security}/100 |`,
      ``,
      `**State:** ${healthScore.state.replace(/_/g, ' ')}`,
      ``,
      `## Repository`,
      ``,
      `- **Language:** ${meta.language}`,
      `- **Framework:** ${meta.framework ?? 'N/A'}`,
      `- **Package manager:** ${meta.packageManager}`,
      `- **Test frameworks:** ${meta.testFrameworks.join(', ') || 'None'}`,
      `- **Source files:** ${meta.sourceFiles.length}`,
      `- **Test files:** ${meta.testFiles.length}`,
      ``,
      `## Testing Gaps (${testGaps.length})`,
      ``,
      ...testGaps.slice(0, 20).map((g) =>
        `- **[${g.severity.toUpperCase()}]** ${g.title}  \n  ${g.reason}`
      ),
      ``,
      `## Configuration Issues (${configHealth.issues.length})`,
      ``,
      ...configHealth.issues.slice(0, 20).map((i) =>
        `- **[${i.severity.toUpperCase()}]** ${i.title}  \n  Fix: ${i.recommendedFix}`
      ),
      ``,
      `## Priority Findings`,
      ``,
      ...priorityFindings.map((f) =>
        `### ${f.level.toUpperCase()}: ${f.title}\n\n${f.description}\n\n**Recommendation:** ${f.recommendation}\n`
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctor-dev-report-${meta.name}-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Doctor Dev Health Report</h2>
              <p className="text-xs text-gray-400 font-mono">{meta.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadMarkdown} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" /> Markdown
            </button>
            <button onClick={downloadJson} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
          <Clock className="w-3.5 h-3.5" />
          <span>Generated {new Date(result.scannedAt).toLocaleString()}</span>
          <span className="mx-2 text-gray-800">·</span>
          <span>ID: {result.analysisId.slice(0, 8)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HealthScoreCard score={healthScore} />
        <div className="lg:col-span-2 card">
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-4">Findings Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Testing gaps', value: testGaps.length },
              { label: 'Config issues', value: configHealth.issues.length },
              { label: 'Test files', value: testProfile.totalTestFiles },
              { label: 'Test cases', value: testProfile.totalTestCount },
              { label: 'Critical risks', value: priorityFindings.filter((f) => f.level === 'critical').length },
              { label: 'Env vars', value: configHealth.envVars.length },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="text-xl font-bold tabular-nums text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {priorityFindings.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
            Prioritised Findings ({priorityFindings.length})
          </h3>
          <div className="space-y-2">
            {priorityFindings.map((f) => (
              <div key={f.id} className="card flex items-start gap-4">
                <div className="mt-0.5">
                  <span className={severityBadgeClass(f.level)}>{f.level.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 mb-1">{f.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed mb-2">{f.description}</p>
                  <div className="bg-gray-800/50 rounded p-2.5 border border-gray-700/50">
                    <p className="text-xs text-gray-500 font-medium mb-1">Recommendation</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{f.recommendation}</p>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Impact: {f.estimatedImpact}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card text-center py-8">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">Final Grade</p>
        <p className={`text-8xl font-bold tabular-nums ${gradeColor(healthScore.grade)}`}>{healthScore.grade}</p>
        <p className="text-sm text-gray-500 mt-2">Overall score: {healthScore.overall}/100</p>
      </div>
    </div>
  );
}
