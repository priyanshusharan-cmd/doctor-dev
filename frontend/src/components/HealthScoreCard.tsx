import { gradeColor, scoreBarColor, stateColor, stateLabel } from '../lib/utils';
import type { HealthScore } from '../types';
import { useEffect, useState } from 'react';

interface Props {
  score: HealthScore;
}

// Animated circular gauge
function CircleGauge({ value, color, size = 120 }: { value: number; color: string; size?: number }) {
  const [animated, setAnimated] = useState(0);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (animated / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(55, 65, 81, 0.5)"
          strokeWidth={8}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-white tabular-nums">{value}</span>
        <span className="text-xs text-gray-500">/100</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  const cls = value >= 80 ? 'score-bar-green' : value >= 60 ? 'score-bar-blue' : value >= 40 ? 'score-bar-yellow' : value >= 20 ? 'score-bar-orange' : 'score-bar-red';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-xs font-semibold text-gray-300 tabular-nums font-mono">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800/80 overflow-hidden">
        <div
          className={`h-full rounded-full ${cls}`}
          style={{ width: `${animated}%`, transition: 'width 1s ease-out' }}
        />
      </div>
    </div>
  );
}

const GAUGE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
};

export default function HealthScoreCard({ score }: Props) {
  const gaugeColor = GAUGE_COLORS[score.grade] ?? '#6b7280';

  return (
    <div className="card rounded-2xl flex flex-col gap-5">
      {/* Score + gauge */}
      <div className="flex items-center gap-5">
        <CircleGauge value={score.overall} color={gaugeColor} size={110} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Health Score</p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className={`text-5xl font-black tabular-nums ${gradeColor(score.grade)}`}>{score.grade}</span>
            <span className="text-xs text-gray-600 font-medium">grade</span>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            score.state === 'healthy'
              ? 'text-green-400 border-green-800/60 bg-green-950/30'
              : score.state === 'critical'
              ? 'text-red-400 border-red-800/60 bg-red-950/30'
              : 'text-yellow-400 border-yellow-800/60 bg-yellow-950/30'
          }`}>
            {stateLabel(score.state)}
          </span>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-3 pt-1 border-t border-gray-800/60">
        <ScoreBar label="Testing" value={score.testing} />
        <ScoreBar label="Configuration" value={score.configuration} />
        <ScoreBar label="Security" value={score.security} />
      </div>
    </div>
  );
}
