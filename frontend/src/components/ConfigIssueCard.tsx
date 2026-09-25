import { severityBadgeClass, severityBorderClass, ISSUE_CATEGORY_LABELS, shortPath, confidencePct } from '../lib/utils';
import { FileCode2, ChevronDown, ChevronRight, Wrench, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { ConfigIssue } from '../types';

const CATEGORY_ICONS: Record<string, string> = {
  environment: '🔑',
  docker:      '🐳',
  ci:          '⚙️',
  ports:       '🔌',
  security:    '🛡️',
  documentation: '📖',
  scripts:     '📜',
  runtime:     '🟢',
  package:     '📦',
};

export default function ConfigIssueCard({ issue }: { issue: ConfigIssue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border border-gray-800/60 border-l-4 ${severityBorderClass(issue.severity)} rounded-xl overflow-hidden transition-all duration-200 hover:border-gray-700/60`}
      style={{ background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.8), rgba(11, 17, 32, 0.9))' }}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-1 flex-shrink-0">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-500" />
            : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={severityBadgeClass(issue.severity)}>{issue.severity.toUpperCase()}</span>
            <span className="text-xs bg-gray-800/70 text-gray-400 border border-gray-700/50 px-2 py-0.5 rounded-md font-medium">
              {CATEGORY_ICONS[issue.category] ?? ''} {ISSUE_CATEGORY_LABELS[issue.category] ?? issue.category}
            </span>
            <span className="text-xs text-gray-700 ml-auto">
              confidence{' '}
              <span className={`font-semibold ${issue.confidence > 0.7 ? 'text-green-500' : issue.confidence > 0.4 ? 'text-yellow-500' : 'text-red-500'}`}>
                {confidencePct(issue.confidence)}
              </span>
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-100">{issue.title}</p>
          {issue.filePath && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <FileCode2 className="w-3 h-3 text-gray-700" />
              <span className="text-xs text-gray-600 font-mono">
                {shortPath(issue.filePath)}{issue.line ? `:${issue.line}` : ''}
              </span>
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-0 border-t border-gray-800/40 space-y-4">
          <p className="text-sm text-gray-300 leading-relaxed pt-4">{issue.description}</p>

          {/* Evidence */}
          {issue.evidence.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-2 font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Evidence
              </p>
              <div className="space-y-1">
                {issue.evidence.map((e, i) => (
                  <p key={i} className="text-xs text-gray-500 font-mono code-block py-2">{e}</p>
                ))}
              </div>
            </div>
          )}

          {/* Recommended fix */}
          <div className="rounded-xl p-3.5 border" style={{ background: 'rgba(59, 130, 246, 0.04)', borderColor: 'rgba(59, 130, 246, 0.15)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Wrench className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-xs text-blue-500 uppercase tracking-wide font-semibold">Recommended fix</p>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{issue.recommendedFix}</p>
          </div>

          {/* Affected files */}
          {issue.affectedFiles && issue.affectedFiles.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-2 font-semibold">Affected files</p>
              <div className="flex flex-wrap gap-1.5">
                {issue.affectedFiles.map((f) => (
                  <span key={f} className="text-xs font-mono text-gray-400 bg-gray-800/60 border border-gray-700/50 px-2 py-0.5 rounded-md">
                    {shortPath(f)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
