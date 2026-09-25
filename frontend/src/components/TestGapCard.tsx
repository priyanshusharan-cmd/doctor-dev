import { severityBadgeClass, severityBorderClass, GAP_CATEGORY_LABELS, shortPath, confidencePct } from '../lib/utils';
import { FileCode2, ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { TestGap } from '../types';

export default function TestGapCard({ gap }: { gap: TestGap }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border border-gray-800 border-l-4 ${severityBorderClass(gap.severity)} rounded-lg bg-gray-900 overflow-hidden`}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={severityBadgeClass(gap.severity)}>{gap.severity.toUpperCase()}</span>
            <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded">
              {GAP_CATEGORY_LABELS[gap.category] ?? gap.category}
            </span>
            <span className="text-xs text-gray-600 ml-auto">confidence {confidencePct(gap.confidence)}</span>
          </div>
          <p className="text-sm font-medium text-gray-200">{gap.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <FileCode2 className="w-3 h-3 text-gray-600" />
            <span className="text-xs text-gray-500 font-mono">
              {shortPath(gap.filePath)}{gap.lineStart ? `:${gap.lineStart}` : ''}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-800/60 space-y-3">
          <p className="text-sm text-gray-300 leading-relaxed">{gap.description}</p>

          {/* Why */}
          <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Why this matters</p>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{gap.reason}</p>
          </div>

          {/* Evidence */}
          {gap.evidence.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 font-medium">Evidence</p>
              {gap.evidence.map((e, i) => (
                <p key={i} className="text-xs text-gray-500 font-mono bg-gray-950 border border-gray-800 rounded px-2 py-1 mb-1">{e}</p>
              ))}
            </div>
          )}

          {/* Existing tests */}
          {gap.existingTests.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-400" /> Existing tests
              </p>
              {gap.existingTests.map((t) => (
                <p key={t} className="text-xs font-mono text-green-400/70 truncate">{shortPath(t)}</p>
              ))}
            </div>
          )}

          {/* Recommended tests */}
          {gap.recommendedTests.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 font-medium">Recommended tests</p>
              {gap.recommendedTests.map((t, i) => (
                <code key={i} className="block text-xs text-blue-400/80 font-mono bg-gray-950 border border-gray-800 rounded px-3 py-1.5 mb-1">
                  it('{t}', ...)
                </code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
