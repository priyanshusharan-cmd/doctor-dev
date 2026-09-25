import { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import RepoSelector from './components/RepoSelector';
import AnalysisProgress from './components/AnalysisProgress';
import EmptyDashboard from './pages/EmptyDashboard';
import OverviewPage from './pages/OverviewPage';
import TestingPage from './pages/TestingPage';
import ConfigurationPage from './pages/ConfigurationPage';
import ValidationPage from './pages/ValidationPage';
import ReportPage from './pages/ReportPage';
import HistoryDrawer from './components/HistoryDrawer';
import { api } from './api/client';
import type { ActiveTab, AnalysisStatus, AnalysisResult } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>('pending');
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getAnalysis(id);
        setStatus(data.status as AnalysisStatus);
        setStatusLabel(data.statusLabel);
        if (data.error) setError(data.error);

        if (data.status === 'complete' && data.result) {
          stopPolling();
          setResult(data.result);
          setActiveTab('overview');
        } else if (data.status === 'error') {
          stopPolling();
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : 'Polling failed');
        setStatus('error');
      }
    }, 1200);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function handleAnalyze(
    repositoryPath: string,
    opts: { runTests: boolean; generateTests: boolean }
  ) {
    setError(null);
    setResult(null);
    setActiveTab('overview');
    setStatus('pending');

    try {
      const res = await api.startAnalysis(repositoryPath, opts);
      setAnalysisId(res.analysisId);
      setStatus('scanning');
      startPolling(res.analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
      setStatus('error');
    }
  }

  async function handleDemo() {
    await handleAnalyze('./demo-repository', { runTests: false, generateTests: true });
  }

  async function handleLoadAnalysis(id: string) {
    stopPolling();
    setError(null);
    setStatus('pending');
    try {
      const data = await api.getAnalysis(id);
      setAnalysisId(data.id);
      setStatus(data.status as AnalysisStatus);
      setStatusLabel(data.statusLabel);
      if (data.error) setError(data.error);
      
      if (data.status === 'complete' && data.result) {
        setResult(data.result);
        setActiveTab('overview');
      } else if (data.status === 'pending' || data.status === 'scanning' || data.status === 'analyzing_code' || data.status === 'analyzing_tests' || data.status === 'analyzing_config' || data.status === 'prioritizing') {
        startPolling(data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
      setStatus('error');
    }
  }

  const isRunning = status !== 'pending' && status !== 'complete' && status !== 'error' && analysisId !== null;
  const hasResult = result !== null;

  function renderContent() {
    if (isRunning) {
      return <AnalysisProgress status={status} statusLabel={statusLabel} />;
    }
    if (!hasResult) return <EmptyDashboard />;

    switch (activeTab) {
      case 'overview':
        return <OverviewPage result={result} onTabChange={(tab) => setActiveTab(tab)} />;
      case 'testing':
        return <TestingPage result={result} />;
      case 'configuration':
        return <ConfigurationPage result={result} />;
      case 'validation':
        return <ValidationPage result={result} />;
      case 'report':
        return <ReportPage result={result} />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        hasResult={hasResult} 
        onHistoryClick={() => setHistoryOpen(true)}
      />
      <HistoryDrawer 
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleLoadAnalysis}
      />
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-6 space-y-5">
        <RepoSelector
          onAnalyze={handleAnalyze}
          onDemo={handleDemo}
          isLoading={isRunning}
          error={error}
        />
        <div>{renderContent()}</div>
      </main>
      <footer className="border-t border-gray-800/40 py-4 mt-8">
        <div className="max-w-screen-xl mx-auto px-6 flex items-center justify-between text-xs text-gray-700">
          <span>Doctor Dev · AI Software Health Checker · IBM Bob 2.0 Hackathon 2026</span>
          <a href="https://github.com/priyanshusharan-cmd/doctor-dev" target="_blank" rel="noopener noreferrer"
            className="hover:text-gray-400 transition-colors">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
