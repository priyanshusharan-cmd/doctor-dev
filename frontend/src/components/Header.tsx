import { Activity, Microscope, Settings2 } from 'lucide-react';
import type { ActiveTab } from '../types';

const TABS: { id: ActiveTab; label: string; icon?: React.ReactNode }[] = [
  { id: 'overview',      label: 'Overview' },
  { id: 'testing',       label: 'TestPilot' },
  { id: 'configuration', label: 'ConfigDoctor' },
  { id: 'validation',    label: 'Validation' },
  { id: 'report',        label: 'Report' },
];

interface Props {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  hasResult: boolean;
}

export default function Header({ activeTab, onTabChange, hasResult }: Props) {
  return (
    <header className="border-b border-gray-800/60 sticky top-0 z-40" style={{ background: 'rgba(8, 11, 18, 0.9)', backdropFilter: 'blur(20px)' }}>
      <div className="max-w-screen-xl mx-auto px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="relative w-8 h-8 flex-shrink-0">
              <div className="absolute inset-0 rounded-lg bg-blue-600 opacity-20 blur-md" />
              <div className="relative w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 0 12px rgba(37, 99, 235, 0.5)' }}>
                <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-white font-bold text-base tracking-tight">
                Doctor<span className="text-gradient-blue">Dev</span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                AI Software Health Checker
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasResult && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <span className="pulse-dot-green" />
                Analysis ready
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-800 bg-gray-900/50">
              <span className="text-xs text-gray-600 font-mono">v0.2.0</span>
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-0.5 -mb-px overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            const isDisabled = !hasResult && tab.id !== 'overview';
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => !isDisabled && onTabChange(tab.id)}
                disabled={isDisabled}
                className={[
                  'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap',
                  isActive
                    ? 'border-blue-500 text-blue-400 tab-active'
                    : isDisabled
                    ? 'border-transparent text-gray-700 cursor-not-allowed'
                    : 'border-transparent text-gray-500 hover:text-gray-200 hover:border-gray-600 cursor-pointer',
                ].join(' ')}
              >
                {tab.id === 'testing' && <Microscope className="w-3.5 h-3.5" />}
                {tab.id === 'configuration' && <Settings2 className="w-3.5 h-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
