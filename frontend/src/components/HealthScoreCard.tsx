import { gradeColor, scoreBarColor, stateColor, stateLabel } from '../lib/utils';
import type { HealthScore } from '../types';

interface Props {
  score: HealthScore;
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono text-gray-300 tabular-nums">{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${scoreBarColor(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function HealthScoreCard({ score }: Props) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Health Score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-white tabular-nums">{score.overall}</span>
            <span className="text-gray-500 text-sm">/100</span>
          </div>
          <p className={`text-xs mt-1 font-medium ${stateColor(score.state)}`}>
            {stateLabel(score.state)}
          </p>
        </div>
        <div className={`text-5xl font-bold tabular-nums ${gradeColor(score.grade)}`}>
          {score.grade}
        </div>
      </div>
      <div className="space-y-3">
        <ScoreRow label="Testing" value={score.testing} />
        <ScoreRow label="Configuration" value={score.configuration} />
        <ScoreRow label="Security" value={score.security} />
      </div>
    </div>
  );
}
