import { FlaskConical, Settings2, ShieldCheck, Scale } from 'lucide-react';
import type { HealthScore, ScoreDimension } from '../types';

const DIMENSIONS: { id: ScoreDimension; label: string; weight: string; icon: React.ReactNode; accent: string }[] = [
  { id: 'testing',       label: 'Testing',       weight: '45%', icon: <FlaskConical className="w-3.5 h-3.5" />, accent: 'text-purple-400' },
  { id: 'configuration', label: 'Configuration', weight: '30%', icon: <Settings2 className="w-3.5 h-3.5" />,    accent: 'text-cyan-400' },
  { id: 'security',      label: 'Security',      weight: '25%', icon: <ShieldCheck className="w-3.5 h-3.5" />,  accent: 'text-green-400' },
];

/** Explains a health score: every deduction, grouped by dimension. */
export default function ScoreBreakdown({ score }: { score: HealthScore }) {
  const factors = score.factors ?? [];

  return (
    <div className="card rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Scale className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-bold text-gray-200">Why this score</h3>
        <span className="text-xs text-gray-600 ml-auto">overall = 45% testing + 30% configuration + 25% security</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DIMENSIONS.map((d) => {
          const items = factors.filter((f) => f.dimension === d.id);
          return (
            <div key={d.id} className="rounded-xl border border-gray-800/60 bg-gray-900/40 p-3">
              <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${d.accent}`}>
                {d.icon}
                {d.label}
                <span className="ml-auto font-mono text-gray-300">{score[d.id]}</span>
                <span className="text-gray-600 font-normal">· {d.weight}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-600">No deductions.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.slice(0, 6).map((f, i) => (
                    <li key={`${f.label}-${i}`} className="flex items-start gap-2 text-xs" title={f.detail}>
                      <span className={`font-mono tabular-nums w-9 flex-shrink-0 text-right ${f.points < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {f.points > 0 ? `+${f.points}` : f.points}
                      </span>
                      <span className="text-gray-400 leading-snug">
                        {f.label}
                        {f.detail && <span className="block text-gray-600">{f.detail}</span>}
                      </span>
                    </li>
                  ))}
                  {items.length > 6 && <li className="text-xs text-gray-600 pl-11">+{items.length - 6} smaller deductions</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
