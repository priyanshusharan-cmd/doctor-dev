import ConfigIssueCard from '../components/ConfigIssueCard';
import type { AnalysisResult } from '../types';
import { Settings2, KeyRound, Eye, EyeOff, Network } from 'lucide-react';
import { useState } from 'react';

interface Props { result: AnalysisResult }

export default function ConfigurationPage({ result }: Props) {
  const { configHealth } = result;
  const { issues, envVars, portMentions } = configHealth;
  const [showSecrets, setShowSecrets] = useState(false);

  const bySeverity = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    high:     issues.filter((i) => i.severity === 'high').length,
    medium:   issues.filter((i) => i.severity === 'medium').length,
    low:      issues.filter((i) => i.severity === 'low').length,
  };

  const missingVars = envVars.filter((v) => v.usedIn.length > 0 && v.definedIn.length === 0);
  const secretVars = envVars.filter((v) => v.isSecret);
  const uniquePorts = new Set(portMentions.map((p) => p.port));
  const portConflict = uniquePorts.size > 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card rounded-2xl text-center">
          <p className={`text-3xl font-black tabular-nums ${issues.length > 0 ? 'text-orange-400' : 'text-green-400'}`}>{issues.length}</p>
          <p className="text-xs text-gray-600 mt-1 font-medium">Total issues</p>
        </div>
        <div className="card rounded-2xl text-center">
          <p className="text-3xl font-black tabular-nums text-blue-400">{envVars.length}</p>
          <p className="text-xs text-gray-600 mt-1 font-medium">Env variables</p>
        </div>
        <div className="card rounded-2xl text-center">
          <p className={`text-3xl font-black tabular-nums ${missingVars.length > 0 ? 'text-red-400' : 'text-green-400'}`}>{missingVars.length}</p>
          <p className="text-xs text-gray-600 mt-1 font-medium">Undocumented vars</p>
        </div>
        <div className="card rounded-2xl text-center">
          <p className={`text-3xl font-black tabular-nums ${portConflict ? 'text-yellow-400' : 'text-white'}`}>{uniquePorts.size}</p>
          <p className="text-xs text-gray-600 mt-1 font-medium">Ports detected</p>
        </div>
      </div>

      {/* Config presence strip */}
      <div className="card rounded-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/50 border border-cyan-800/40 flex items-center justify-center">
            <Settings2 className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="text-sm font-bold text-gray-200">Configuration Presence</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '.env.example', present: configHealth.hasEnvExample, icon: '📄' },
            { label: 'dotenv',       present: configHealth.hasDotenv,     icon: '🔐' },
            { label: `${configHealth.dockerfiles.length} Dockerfile`,  present: configHealth.dockerfiles.length > 0, icon: '🐳' },
            { label: `${configHealth.ciFiles.length} CI file`,         present: configHealth.ciFiles.length > 0,    icon: '⚙️' },
          ].map(({ label, present, icon }) => (
            <span key={label} className={`text-xs px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 ${
              present
                ? 'bg-green-950/30 text-green-400 border-green-800/40'
                : 'bg-gray-800/30 text-gray-600 border-gray-700/40'
            }`}>
              {icon} {present ? '✓' : '✗'} {label}
            </span>
          ))}
        </div>
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

      {/* Issues */}
      {issues.length === 0 ? (
        <div className="card rounded-2xl text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-green-950/40 border border-green-800/30 flex items-center justify-center mx-auto mb-4">
            <Settings2 className="w-7 h-7 text-green-400" />
          </div>
          <p className="text-base font-bold text-green-400 mb-1">No configuration issues found</p>
          <p className="text-sm text-gray-600">Configuration looks consistent across all files.</p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-bold text-gray-200 mb-3">
            Configuration Issues <span className="text-gray-600 font-normal">({issues.length})</span>
          </h3>
          <div className="space-y-2">
            {issues.map((issue) => <ConfigIssueCard key={issue.id} issue={issue} />)}
          </div>
        </div>
      )}

      {/* Port mentions */}
      {portMentions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-gray-200">
              Port Mentions <span className="text-gray-600 font-normal">({portMentions.length})</span>
            </h3>
            {portConflict && (
              <span className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800/40 px-2 py-0.5 rounded-full font-medium">
                ⚠ Inconsistent ports
              </span>
            )}
          </div>
          <div className="card rounded-2xl divide-y divide-gray-800/50">
            {portMentions.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className={`text-sm font-bold font-mono w-16 flex-shrink-0 ${portConflict ? 'text-yellow-400' : 'text-blue-400'}`}>
                  :{p.port}
                </span>
                <span className="text-xs text-gray-500 font-mono flex-1 truncate">{p.filePath}</span>
                <span className="text-xs text-gray-700 truncate max-w-xs hidden lg:block">{p.context}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Env var table */}
      {envVars.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-gray-200">
              Environment Variables <span className="text-gray-600 font-normal">({envVars.length})</span>
            </h3>
            <button
              onClick={() => setShowSecrets(!showSecrets)}
              className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showSecrets ? 'Hide secrets' : 'Show secret flags'}
            </button>
          </div>
          <div className="card rounded-2xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 text-left border-b border-gray-800/60">
                  <th className="pb-3 font-semibold pr-4 uppercase tracking-wide">Name</th>
                  <th className="pb-3 font-semibold pr-4 uppercase tracking-wide">Defined in</th>
                  <th className="pb-3 font-semibold pr-4 uppercase tracking-wide">Used in</th>
                  <th className="pb-3 font-semibold pr-4 uppercase tracking-wide">Default</th>
                  {showSecrets && <th className="pb-3 font-semibold uppercase tracking-wide">Secret</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40">
                {envVars.map((v) => {
                  const isMissing = missingVars.some((m) => m.name === v.name);
                  return (
                    <tr key={v.name} className={isMissing ? 'bg-red-950/10' : ''}>
                      <td className="py-2.5 pr-4 font-mono font-semibold text-gray-200">{v.name}</td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {v.definedIn.length > 0
                          ? v.definedIn.join(', ')
                          : <span className="text-red-400 font-semibold">not documented</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{v.usedIn.length} file(s)</td>
                      <td className="py-2.5 pr-4">
                        {v.hasDefault
                          ? <span className="text-green-400 font-semibold">yes</span>
                          : <span className="text-gray-700">no</span>}
                      </td>
                      {showSecrets && (
                        <td className="py-2.5">
                          {v.isSecret
                            ? <span className="flex items-center gap-1 text-orange-400 font-semibold"><Eye className="w-3 h-3" /> secret</span>
                            : <span className="text-gray-700">no</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
