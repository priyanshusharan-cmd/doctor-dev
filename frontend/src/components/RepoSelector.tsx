import { FolderOpen, Play, FlaskConical, Loader2, AlertCircle, ChevronRight, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface Props {
  onAnalyze: (repoPath: string, opts: { runTests: boolean; generateTests: boolean }) => void;
  onDemo: () => void;
  isLoading: boolean;
  error: string | null;
}

export default function RepoSelector({ onAnalyze, onDemo, isLoading, error }: Props) {
  const [repoPath, setRepoPath] = useState('');
  const [runTests, setRunTests] = useState(false);
  const [generateTests, setGenerateTests] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repoPath.trim()) return;
    onAnalyze(repoPath.trim(), { runTests, generateTests });
  }

  return (
    <div className="rounded-2xl border border-gray-800/60 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.8) 0%, rgba(11, 17, 32, 0.9) 100%)' }}>
      <div className="px-6 py-4 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-950/60 border border-blue-800/50 flex items-center justify-center">
            <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-gray-200">Analyze Repository</span>
        </div>
        <button
          id="demo-btn"
          type="button"
          onClick={onDemo}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-40"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          Try Demo
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Path input */}
          <div className="flex-1">
            <input
              id="repo-path-input"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/absolute/path/to/your/project"
              disabled={isLoading}
              className="input-dark disabled:opacity-50 disabled:cursor-not-allowed w-full"
              style={{ borderColor: error ? 'rgba(239, 68, 68, 0.6)' : undefined }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              id="analyze-btn"
              type="submit"
              disabled={isLoading || !repoPath.trim()}
              className="btn-primary flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isLoading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>

        {/* Options row */}
        <div className="flex flex-wrap gap-5 mt-4">
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div className="relative">
              <input
                type="checkbox"
                checked={generateTests}
                onChange={(e) => setGenerateTests(e.target.checked)}
                disabled={isLoading}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-150 ${
                generateTests ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-600'
              }`}>
                {generateTests && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="currentColor"><path d="M9 1L3.5 6.5 1 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Generate test suggestions
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div className="relative">
              <input
                type="checkbox"
                checked={runTests}
                onChange={(e) => setRunTests(e.target.checked)}
                disabled={isLoading}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-150 ${
                runTests ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-600'
              }`}>
                {runTests && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="currentColor"><path d="M9 1L3.5 6.5 1 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
              Run existing tests
            </span>
          </label>
          <span className="text-xs text-gray-700 hidden sm:block ml-auto">
            Analysis is read-only — no files are modified
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-950/30 border border-red-800/50 text-sm text-red-300 mt-4">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
