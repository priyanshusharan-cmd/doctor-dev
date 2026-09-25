import { Loader2, CheckCircle2 } from 'lucide-react';
import type { AnalysisStatus } from '../types';

interface Props {
  status: AnalysisStatus;
  statusLabel: string;
}

const STEP_ORDER: AnalysisStatus[] = [
  'scanning',
  'analyzing_code',
  'analyzing_tests',
  'analyzing_config',
  'prioritizing',
];

const STEP_NAMES: Partial<Record<AnalysisStatus, string>> = {
  scanning:         'Scan',
  analyzing_code:   'Code',
  analyzing_tests:  'Tests',
  analyzing_config: 'Config',
  prioritizing:     'Score',
};

const PERCENT: Partial<Record<AnalysisStatus, number>> = {
  pending:          5,
  scanning:         20,
  analyzing_code:   40,
  analyzing_tests:  60,
  analyzing_config: 75,
  prioritizing:     90,
  complete:         100,
};

export default function AnalysisProgress({ status, statusLabel }: Props) {
  if (status === 'complete' || status === 'error') return null;

  const pct = PERCENT[status] ?? 10;
  const currentIdx = STEP_ORDER.indexOf(status);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2.5">
        <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
        <span className="text-sm font-medium text-gray-200">{statusLabel || 'Initialising…'}</span>
        <span className="ml-auto text-xs text-gray-500 font-mono tabular-nums">{pct}%</span>
      </div>

      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEP_ORDER.map((step, idx) => {
          const isDone    = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={step} className="flex items-center gap-1">
              <span className={[
                'text-xs font-medium',
                isDone    ? 'text-green-400' :
                isCurrent ? 'text-blue-400' :
                            'text-gray-700',
              ].join(' ')}>
                {isDone && <CheckCircle2 className="w-3 h-3 inline -mt-0.5 mr-0.5" />}
                {STEP_NAMES[step]}
              </span>
              {idx < STEP_ORDER.length - 1 && <span className="text-gray-800">›</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
