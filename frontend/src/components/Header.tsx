import { Shield } from 'lucide-react';
import type { ActiveTab } from '../types';

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'overview',       label: 'Overview' },
  { id: 'testing',        label: 'Testing' },
  { id: 'configuration',  label: 'Configuration' },
  { id: 'validation',     label: 'Validation' },
  { id: 'report',         label: 'Report' },
];

interface Props {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  hasResult: boolean;
}

export default function Header({ activeTab, onTabChange, hasResult }: Props) {
  return (
    <header className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-screen-xl mx-auto px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-white font-semibold text-base tracking-tight">Doctor Dev</span>
              <span className="text-gray-500 text-xs hidden sm:block">
                Repository Validation &amp; Health
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-mono">v0.1.0</span>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            const isDisabled = !hasResult && tab.id !== 'overview';
            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && onTabChange(tab.id)}
                disabled={isDisabled}
                className={[
                  'px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : isDisabled
                    ? 'border-transparent text-gray-700 cursor-not-allowed'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
