import ConfigIssueCard from '../components/ConfigIssueCard';
import type { AnalysisResult } from '../types';
import { Settings2, KeyRound, Eye } from 'lucide-react';

interface Props { result: AnalysisResult }

export default function ConfigurationPage({ result }: Props) {
  const { configHealth } = result;
  const { issues, envVars, portMentions } = configHealth;

  const bySeverity = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    high:     issues.filter((i) => i.severity === 'high').length,
    medium:   issues.filter((i) => i.severity === 'medium').length,
    low:      issues.filter((i) => i.severity === 'low').length,
  };

  const missingVars = envVars.filter((v) => v.usedIn.length > 0 && v.definedIn.length === 0);

  return (
    <div className="space-y-5">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-bold text-white tabular-nums">{issues.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total issues</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-white tabular-nums">{envVars.length}</p>
          <p className="text-xs text-gray-500 mt-1">Env variables</p>
        </div>
        <div className="card text-center">
          <p className={`text-2xl font-bold tabular-nums ${missingVars.length > 0 ? 'text-red-400' : 'text-white'}`}>
            {missingVars.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Undocumented vars</p>
        </div>
        <div className="card text-center">
          <p className={`text-2xl font-bold tabular-nums ${portMentions.length > 1 ? 'text-yellow-400' : 'text-white'}`}>
            {new Set(portMentions.map((p) => p.port)).size}
          </p>
          <p className="text-xs text-gray-500 mt-1">Ports detected</p>
        </div>
      </div>

      {/* Config presence strip */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-gray-200">Configuration Files</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '.env.example', present: configHealth.hasEnvExample },
            { label: 'dotenv', present: configHealth.hasDotenv },
            { label: `${configHealth.dockerfiles.length} Dockerfile(s)`, present: configHealth.dockerfiles.length > 0 },
            { label: `${configHealth.ciFiles.length} CI file(s)`, present: configHealth.ciFiles.length > 0 },
          ].map(({ label, present }) => (
            <span key={label} className={`text-xs px-2.5 py-1 rounded border font-medium ${
              present ? 'bg-green-950 text-green-400 border-green-800' : 'bg-gray-800 text-gray-600 border-gray-700'
            }`}>
              {present ? '✓' : '✗'} {label}
            </span>
          ))}
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {(Object.entries(bySeverity) as [string, number][]).map(([sev, count]) => (
          <div key={sev} className="card py-3">
            <p className="text-xl font-bold tabular-nums text-white">{count}</p>
            <p className={`text-xs mt-0.5 font-medium ${
              sev === 'critical' ? 'text-red-400' : sev === 'high' ? 'text-orange-400' :
              sev === 'medium' ? 'text-yellow-400' : 'text-gray-500'
            }`}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</p>
          </div>
        ))}
      </div>

      {/* Issues */}
      {issues.length === 0 ? (
        <div className="card text-center py-10">
          <Settings2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-green-400">No configuration issues found</p>
        </div>
      ) : (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
            Configuration Issues ({issues.length})
          </h3>
          <div className="space-y-2">
            {issues.map((issue) => <ConfigIssueCard key={issue.id} issue={issue} />)}
          </div>
        </div>
      )}

      {/* Env var table */}
      {envVars.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" />
            Environment Variables ({envVars.length})
          </h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium pr-4">Name</th>
                  <th className="pb-2 font-medium pr-4">Defined in</th>
                  <th className="pb-2 font-medium pr-4">Used in</th>
                  <th className="pb-2 font-medium pr-4">Default</th>
                  <th className="pb-2 font-medium">Secret</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {envVars.map((v) => (
                  <tr key={v.name} className={missingVars.some((m) => m.name === v.name) ? 'bg-red-950/20' : ''}>
                    <td className="py-2 pr-4 font-mono text-gray-300 font-medium">{v.name}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {v.definedIn.length > 0 ? v.definedIn.join(', ') : <span className="text-red-400">not documented</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{v.usedIn.length} file(s)</td>
                    <td className="py-2 pr-4">{v.hasDefault ? <span className="text-green-400">yes</span> : <span className="text-gray-600">no</span>}</td>
                    <td className="py-2">
                      {v.isSecret
                        ? <span className="flex items-center gap-1 text-orange-400"><Eye className="w-3 h-3" /> yes</span>
                        : <span className="text-gray-600">no</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Port mentions */}
      {portMentions.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
            Port Mentions ({portMentions.length})
          </h3>
          <div className="card divide-y divide-gray-800">
            {portMentions.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-mono font-bold text-blue-400 w-12">{p.port}</span>
                <span className="text-xs text-gray-500 font-mono flex-1 truncate">{p.filePath}</span>
                <span className="text-xs text-gray-600 truncate max-w-xs hidden md:block">{p.context}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
