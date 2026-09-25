import { FolderOpen, Play, FlaskConical, Loader2, AlertCircle, ChevronRight, Sparkles, Github, HardDrive } from 'lucide-react';
import { useState, useCallback } from 'react';

interface Props {
  onAnalyze: (repoPath: string, opts: { runTests: boolean; generateTests: boolean }) => void;
  onDemo: () => void;
  isLoading: boolean;
  error: string | null;
}

/** Detect GitHub URLs or shorthand (user/repo) */
function detectInputType(value: string): 'github' | 'local' | 'empty' {
  const v = value.trim();
  if (!v) return 'empty';
  if (
    /^https?:\/\/github\.com\//i.test(v) ||
    /^git@github\.com:/i.test(v) ||
    /^[\w.\-]+\/[\w.\-]+$/.test(v)
  ) return 'github';
  return 'local';
}

const EXAMPLES = [
  { label: 'GitHub URL', value: 'https://github.com/vercel/next.js' },
  { label: 'Short form', value: 'facebook/react' },
  { label: 'Local path', value: '/Users/you/your-project' },
];

export default function RepoSelector({ onAnalyze, onDemo, isLoading, error }: Props) {
  const [repoPath, setRepoPath] = useState('');
  const [runTests, setRunTests] = useState(false);
  const [generateTests, setGenerateTests] = useState(true);
  const [showExamples, setShowExamples] = useState(false);

  const inputType = detectInputType(repoPath);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    onAnalyze(repoPath.trim(), { runTests, generateTests });
  }, [repoPath, runTests, generateTests, onAnalyze]);

  function useExample(value: string) {
    setRepoPath(value);
    setShowExamples(false);
  }

  const isGitHub = inputType === 'github';

  return (
    <div className="rounded-2xl border border-gray-800/60 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.8) 0%, rgba(11, 17, 32, 0.9) 100%)' }}>
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-950/60 border border-blue-800/50 flex items-center justify-center">
            {isGitHub
              ? <Github className="w-3.5 h-3.5 text-blue-400" />
              : <FolderOpen className="w-3.5 h-3.5 text-blue-400" />}
          </div>
          <span className="text-sm font-semibold text-gray-200">Analyze Repository</span>
          {isGitHub && (
            <span className="text-xs font-medium text-purple-400 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Github className="w-3 h-3" /> GitHub
            </span>
          )}
          {inputType === 'local' && (
            <span className="text-xs font-medium text-cyan-400 bg-cyan-950/30 border border-cyan-800/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <HardDrive className="w-3 h-3" /> Local
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowExamples(!showExamples)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            examples
          </button>
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
      </div>

      <form onSubmit={handleSubmit} className="p-5">
        {/* Examples dropdown */}
        {showExamples && (
          <div className="mb-3 p-3 rounded-xl border border-gray-700/50 bg-gray-800/30 space-y-1">
            <p className="text-xs text-gray-600 mb-2 font-medium">Click to use an example:</p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.value}
                type="button"
                onClick={() => useExample(ex.value)}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-700/40 transition-colors group"
              >
                <span className="text-xs text-gray-600 w-20 flex-shrink-0 font-medium">{ex.label}</span>
                <span className="text-xs text-gray-400 font-mono group-hover:text-gray-200 transition-colors">{ex.value}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Path / URL input */}
          <div className="flex-1 relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              {isGitHub
                ? <Github className="w-3.5 h-3.5 text-purple-500" />
                : inputType === 'local'
                ? <HardDrive className="w-3.5 h-3.5 text-cyan-600" />
                : <FolderOpen className="w-3.5 h-3.5 text-gray-700" />}
            </div>
            <input
              id="repo-path-input"
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="GitHub URL, user/repo, or /local/path"
              disabled={isLoading}
              className="input-dark disabled:opacity-50 disabled:cursor-not-allowed w-full pl-9"
              style={{
                borderColor: error
                  ? 'rgba(239, 68, 68, 0.6)'
                  : isGitHub
                  ? 'rgba(139, 92, 246, 0.5)'
                  : undefined,
              }}
            />
          </div>

          {/* Analyze button */}
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
            {isLoading
              ? isGitHub ? 'Cloning…' : 'Analyzing…'
              : 'Analyze'}
          </button>
        </div>

        {/* Options row */}
        <div className="flex flex-wrap gap-5 mt-4">
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div className="relative">
              <input type="checkbox" checked={generateTests} onChange={(e) => setGenerateTests(e.target.checked)} disabled={isLoading} className="sr-only" />
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-150 ${generateTests ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                {generateTests && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M9 1L3.5 6.5 1 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Generate test suggestions
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div className="relative">
              <input type="checkbox" checked={runTests} onChange={(e) => setRunTests(e.target.checked)} disabled={isLoading} className="sr-only" />
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all duration-150 ${runTests ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                {runTests && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none"><path d="M9 1L3.5 6.5 1 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
              Run existing tests {runTests && isGitHub && <span className="text-gray-600">(local only)</span>}
            </span>
          </label>
          <span className="text-xs text-gray-700 hidden sm:block ml-auto">
            {isGitHub ? '🌐 Shallow clone · read-only' : 'Analysis is read-only — no files are modified'}
          </span>
        </div>

        {/* GitHub hint */}
        {isGitHub && !error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-purple-400/70">
            <Github className="w-3 h-3" />
            <span>Public repositories are cloned with <code className="font-mono">git clone --depth 1</code> and deleted after analysis.</span>
          </div>
        )}

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
