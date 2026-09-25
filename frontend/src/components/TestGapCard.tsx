import { severityBadgeClass, severityBorderClass, GAP_CATEGORY_LABELS, shortPath, confidencePct } from '../lib/utils';
import { FileCode2, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Lightbulb, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import type { TestGap } from '../types';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
      title="Copy path"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function TestGapCard({ gap }: { gap: TestGap }) {
  const [expanded, setExpanded] = useState(false);

  const severityGlow = {
    critical: 'hover:shadow-red-950/40',
    high:     'hover:shadow-orange-950/40',
    medium:   'hover:shadow-yellow-950/40',
    low:      '',
  }[gap.severity] ?? '';

  return (
    <div className={`border border-gray-800/60 border-l-4 ${severityBorderClass(gap.severity)} rounded-xl overflow-hidden transition-all duration-200 ${severityGlow} hover:shadow-lg`}
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
            <span className={severityBadgeClass(gap.severity)}>{gap.severity.toUpperCase()}</span>
            <span className="text-xs bg-gray-800/70 text-gray-400 border border-gray-700/50 px-2 py-0.5 rounded-md font-medium">
              {GAP_CATEGORY_LABELS[gap.category] ?? gap.category}
            </span>
            <span className="text-xs text-gray-700 ml-auto flex items-center gap-1">
              confidence
              <span className={`font-semibold ${gap.confidence > 0.7 ? 'text-green-500' : gap.confidence > 0.4 ? 'text-yellow-500' : 'text-red-500'}`}>
                {confidencePct(gap.confidence)}
              </span>
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-100">{gap.title}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <FileCode2 className="w-3 h-3 text-gray-700" />
            <span className="text-xs text-gray-600 font-mono">{shortPath(gap.filePath)}{gap.lineStart ? `:${gap.lineStart}` : ''}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-0 border-t border-gray-800/40 space-y-4">
          <p className="text-sm text-gray-300 leading-relaxed pt-4">{gap.description}</p>

          {/* Why this matters */}
          <div className="rounded-xl p-3.5 border" style={{ background: 'rgba(234, 179, 8, 0.04)', borderColor: 'rgba(234, 179, 8, 0.15)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
              <p className="text-xs text-yellow-600 uppercase tracking-wide font-semibold">Why this matters</p>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{gap.reason}</p>
          </div>

          {/* Evidence */}
          {gap.evidence.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-2 font-semibold">Evidence</p>
              <div className="space-y-1">
                {gap.evidence.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-950/60 border border-gray-800/50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-500 font-mono flex-1">{e}</span>
                    <CopyButton text={e} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing tests */}
          {gap.existingTests.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-2 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-500" /> Existing tests
              </p>
              {gap.existingTests.map((t) => (
                <p key={t} className="text-xs font-mono text-green-400/80 truncate mb-1">{shortPath(t)}</p>
              ))}
            </div>
          )}

          {/* Recommended tests */}
          {gap.recommendedTests.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide mb-2 font-semibold flex items-center gap-1.5">
                <Lightbulb className="w-3 h-3 text-blue-400" /> Recommended tests to add
              </p>
              <div className="space-y-1.5">
                {gap.recommendedTests.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 code-block py-2">
                    <span className="text-blue-500 font-semibold">it(</span>
                    <span className="text-green-400">'{t}'</span>
                    <span className="text-blue-500">, ...)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
