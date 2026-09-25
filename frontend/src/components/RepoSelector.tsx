import { FolderOpen, Play, FlaskConical, Loader2, AlertCircle, Sparkles, Github, HardDrive, Clock, List } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';

interface Props {
  onAnalyze: (repoPath: string, opts: { runTests: boolean; generateTests: boolean }) => void;
  onDemo: () => void;
  onHistoryClick: () => void;
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
    /^[a-zA-Z0-9\-]+\/[\w.\-]+$/.test(v)
  ) return 'github';
  return 'local';
}

const EXAMPLES = [
  { label: 'GitHub URL', value: 'https://github.com/vercel/next.js' },
  { label: 'Short form', value: 'facebook/react' },
  { label: 'Local path', value: '/Users/you/your-project' },
];

export default function RepoSelector({ onAnalyze, onDemo, onHistoryClick, isLoading, error }: Props) {
  const [repoPath, setRepoPath] = useState('');
  const [runTests, setRunTests] = useState(false);
  const [generateTests, setGenerateTests] = useState(true);
  const [showExamples, setShowExamples] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const inputType = detectInputType(repoPath);
  const isGitHub = inputType === 'github';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    onAnalyze(repoPath.trim(), { runTests: isGitHub ? false : runTests, generateTests });
  }, [repoPath, runTests, generateTests, onAnalyze, isGitHub]);

  function useExample(value: string) {
    setRepoPath(value);
    setShowExamples(false);
  }

  return (
    <div className="rounded-xl border border-gray-800/80 bg-[#0c1017] shadow-2xl overflow-hidden relative">
      {/* Decorative gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800/80 flex items-center justify-between bg-gray-900/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            {isGitHub ? <Github className="w-4 h-4 text-blue-400" /> : <HardDrive className="w-4 h-4 text-blue-400" />}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Analyze Repository</h2>
            <p className="text-xs text-gray-500 mt-0.5">Enter a GitHub URL or local directory path</p>
          </div>
        </div>
        
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-700 bg-gray-800/50 hover:bg-gray-700 hover:text-white text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <FlaskConical className="w-4 h-4" />
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-700 bg-gray-800 shadow-2xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onHistoryClick(); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
              >
                <Clock className="w-4 h-4 text-gray-400" />
                History
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setShowExamples(!showExamples); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
              >
                <List className="w-4 h-4 text-gray-400" />
                Examples
              </button>
              <div className="h-px bg-gray-700 my-1 mx-2"></div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDemo(); }}
                disabled={isLoading}
                className="w-full text-left px-4 py-2 text-sm text-purple-300 hover:bg-gray-700 hover:text-purple-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FlaskConical className="w-4 h-4" />
                Try Demo
              </button>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6">
        {/* Examples dropdown */}
        {showExamples && (
          <div className="mb-4 p-4 rounded-xl border border-gray-700/50 bg-gray-800/30 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Select an example</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.value}
                  type="button"
                  onClick={() => useExample(ex.value)}
                  className="flex flex-col items-start gap-1 p-3 rounded-lg border border-gray-700/30 hover:border-gray-600/50 hover:bg-gray-700/20 transition-all group"
                >
                  <span className="text-xs text-gray-300 font-medium group-hover:text-white transition-colors">{ex.label}</span>
                  <span className="text-[10px] text-gray-500 font-mono truncate w-full text-left group-hover:text-gray-400">{ex.value}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {/* Main Input Area */}
          <div className="relative group/input">
            <div className={`absolute -inset-0.5 rounded-xl blur opacity-20 group-focus-within/input:opacity-50 transition duration-500 ${isGitHub ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
            <div className="relative flex items-center bg-[#080b12] border border-gray-700/50 rounded-lg overflow-hidden focus-within:border-gray-500 transition-colors">
              <div className="pl-4 pr-3 flex items-center justify-center text-gray-500">
                {isGitHub ? <Github className="w-5 h-5 text-gray-400" /> : <FolderOpen className="w-5 h-5 text-gray-400" />}
              </div>
              <input
                id="repo-path-input"
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="Paste a GitHub repository URL or local project path..."
                disabled={isLoading}
                className="w-full bg-transparent border-none focus:outline-none text-sm text-gray-100 py-4 placeholder:text-gray-500 disabled:opacity-50"
              />
              <div className="pr-2 py-2">
                <button
                  id="analyze-btn"
                  type="submit"
                  disabled={isLoading || !repoPath.trim()}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isGitHub 
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  {isLoading ? (isGitHub ? 'Cloning…' : 'Analyzing…') : 'Analyze'}
                </button>
              </div>
            </div>
          </div>

          {/* Configuration Toggles */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-8">
              {/* Toggle 1 */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={generateTests}
                  onClick={() => setGenerateTests(!generateTests)}
                  disabled={isLoading}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 ${generateTests ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  <span className="sr-only">Generate test suggestions</span>
                  <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${generateTests ? 'translate-x-2' : '-translate-x-2'}`} />
                </button>
                <button type="button" onClick={() => setGenerateTests(!generateTests)} className="text-xs font-medium text-gray-300 flex items-center gap-1.5 hover:text-white transition-colors disabled:opacity-50" disabled={isLoading}>
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  AI Test Gen
                </button>
              </div>

              {/* Toggle 2 */}
              {!isGitHub && (
                <div className="flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={runTests}
                    onClick={() => setRunTests(!runTests)}
                    disabled={isLoading}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 ${runTests ? 'bg-blue-600' : 'bg-gray-700'}`}
                  >
                    <span className="sr-only">Run existing tests</span>
                    <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${runTests ? 'translate-x-2' : '-translate-x-2'}`} />
                  </button>
                  <button type="button" onClick={() => setRunTests(!runTests)} className="text-xs font-medium text-gray-300 hover:text-white transition-colors disabled:opacity-50" disabled={isLoading}>
                    Run tests
                  </button>
                </div>
              )}
            </div>
            
            <div className="text-xs text-gray-500 flex items-center gap-1.5 font-medium border border-gray-800/60 bg-gray-900/30 px-2.5 py-1 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
              {isGitHub ? 'Public repos only. Shallow clone.' : 'Read-only analysis.'}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-900/50 text-sm text-red-200 mt-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span className="leading-relaxed font-medium">{error}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
