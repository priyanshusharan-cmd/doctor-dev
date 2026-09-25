import { FolderOpen, Play, FlaskConical, Loader2, AlertCircle } from 'lucide-react';
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
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <FolderOpen className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-gray-200">Repository</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Path input */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">
            Repository Path
          </label>
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/absolute/path/to/project"
            disabled={isLoading}
            className={[
              'w-full bg-gray-950 border rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200',
              'placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-red-700' : 'border-gray-700',
            ].join(' ')}
          />
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4 pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={generateTests}
              onChange={(e) => setGenerateTests(e.target.checked)}
              disabled={isLoading}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-950"
            />
            <span className="text-xs text-gray-400">Generate test suggestions</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runTests}
              onChange={(e) => setRunTests(e.target.checked)}
              disabled={isLoading}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-950"
            />
            <span className="text-xs text-gray-400">Run existing tests</span>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={isLoading || !repoPath.trim()}
            className="btn-primary"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isLoading ? 'Analyzing…' : 'Analyze Repository'}
          </button>

          <button
            type="button"
            onClick={onDemo}
            disabled={isLoading}
            className="btn-secondary"
          >
            <FlaskConical className="w-4 h-4" />
            Try Demo Repository
          </button>
        </div>
      </form>
    </div>
  );
}
