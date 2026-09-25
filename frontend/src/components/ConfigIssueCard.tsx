import { severityBadgeClass, severityBorderClass, ISSUE_CATEGORY_LABELS, shortPath, confidencePct } from '../lib/utils';
import { FileCode2, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { ConfigIssue } from '../types';

export default function ConfigIssueCard({ issue }: { issue: ConfigIssue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border border-gray-800 border-l-4 ${severityBorderClass(issue.severity)} rounded-lg bg-gray-900 overflow-hidden`}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={severityBadgeClass(issue.severity)}>{issue.severity.toUpperCase()}</span>
            <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded">
              {ISSUE_CATEGORY_LABELS[issue.category] ?? issue.category}
            </span>
            <span className="text-xs text-gray-600 ml-auto">confidence {confidencePct(issue.confidence)}</span>
          </div>
          <p className="text-sm font-medium text-gray-200">{issue.title}</p>
          {issue.filePath && (
            <div className="flex items-center gap-1.5 mt-1">
              <FileCode2 className="w-3 h-3 text-gray-600" />
              <span className="text-xs text-gray-500 font-mono">
                {shortPath(issue.filePath)}{issue.line ? `:${issue.line}` : ''}
              </span>
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-800/60 space-y-3">
          <p className="text-sm text-gray-300 leading-relaxed">{issue.description}</p>

          {issue.evidence.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 font-medium">Evidence</p>
              {issue.evidence.map((e, i) => (
                <p key={i} className="text-xs text-gray-500 font-mono bg-gray-950 border border-gray-800 rounded px-2 py-1 mb-1">{e}</p>
              ))}
            </div>
          )}

          <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Wrench className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Recommended fix</p>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{issue.recommendedFix}</p>
          </div>

          {issue.affectedFiles && issue.affectedFiles.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 font-medium">Affected files</p>
              <div className="flex flex-wrap gap-1.5">
                {issue.affectedFiles.map((f) => (
                  <span key={f} className="text-xs font-mono text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
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
