import { Loader2, CheckCircle2, ScanLine, Code2, FlaskConical, Settings2, BarChart3 } from 'lucide-react';
import type { AnalysisStatus } from '../types';

interface Props {
  status: AnalysisStatus;
  statusLabel: string;
}

const STEPS: { id: AnalysisStatus; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: 'scanning',         label: 'File Scan',   sub: 'Detecting stack',   icon: <ScanLine className="w-4 h-4" />     },
  { id: 'analyzing_code',   label: 'Code AST',    sub: 'Parsing symbols',   icon: <Code2 className="w-4 h-4" />        },
  { id: 'analyzing_tests',  label: 'TestPilot',   sub: 'Mapping coverage',  icon: <FlaskConical className="w-4 h-4" /> },
  { id: 'analyzing_config', label: 'ConfigDoctor',sub: 'Config scan',       icon: <Settings2 className="w-4 h-4" />    },
  { id: 'prioritizing',     label: 'Score',       sub: 'Prioritizing',      icon: <BarChart3 className="w-4 h-4" />    },
];

const STEP_ORDER: AnalysisStatus[] = STEPS.map((s) => s.id);

const PERCENT: Partial<Record<AnalysisStatus, number>> = {
  pending:          5,
  scanning:         20,
  analyzing_code:   40,
  analyzing_tests:  60,
  analyzing_config: 78,
  prioritizing:     92,
  complete:         100,
};

const STATUS_MESSAGES: Partial<Record<AnalysisStatus, string>> = {
  scanning:         'Reading your repository files and detecting technology stack...',
  analyzing_code:   'Building AST, extracting functions, routes and service symbols...',
  analyzing_tests:  'Mapping test coverage to source files and finding gaps...',
  analyzing_config: 'Checking environment variables, Docker, CI and port consistency...',
  prioritizing:     'Calculating health score and prioritising all findings...',
};

export default function AnalysisProgress({ status, statusLabel }: Props) {
  if (status === 'complete' || status === 'error') return null;

  const pct = PERCENT[status] ?? 10;
  const currentIdx = STEP_ORDER.indexOf(status);
  const message = STATUS_MESSAGES[status];

  return (
    <div className="rounded-2xl border border-gray-800/60 overflow-hidden animate-fade-in"
      style={{ background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(11, 17, 32, 0.95))' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-blue-500 opacity-20 blur-md animate-pulse" />
            <div className="relative w-9 h-9 rounded-full bg-blue-950/60 border border-blue-800/50 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{statusLabel || 'Starting analysis…'}</p>
            {message && <p className="text-xs text-gray-500 mt-0.5">{message}</p>}
          </div>
          <span className="ml-auto text-2xl font-bold text-white tabular-nums font-mono">{pct}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full progress-animated transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="px-6 pb-6">
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((step, idx) => {
            const isDone    = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isPending = idx > currentIdx;

            return (
              <div key={step.id} className={`flex flex-col items-center text-center p-3 rounded-xl border transition-all duration-300 ${
                isDone
                  ? 'bg-green-950/20 border-green-800/30'
                  : isCurrent
                  ? 'bg-blue-950/30 border-blue-800/40'
                  : 'bg-gray-900/30 border-gray-800/20'
              }`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-all ${
                  isDone    ? 'bg-green-900/50 text-green-400' :
                  isCurrent ? 'bg-blue-900/60 text-blue-400' :
                              'bg-gray-800/40 text-gray-700'
                }`}>
                  {isDone
                    ? <CheckCircle2 className="w-4 h-4" />
                    : step.icon
                  }
                </div>
                <p className={`text-xs font-semibold leading-tight ${
                  isDone ? 'text-green-400' : isCurrent ? 'text-blue-300' : 'text-gray-700'
                }`}>{step.label}</p>
                <p className={`text-xs mt-0.5 hidden sm:block ${
                  isDone ? 'text-green-600' : isCurrent ? 'text-blue-500/70' : 'text-gray-800'
                }`}>{step.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
