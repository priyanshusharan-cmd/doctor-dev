import { Shield, Microscope, Settings2 } from 'lucide-react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4 text-gray-600">
        {icon}
      </div>
      <p className="text-sm font-medium text-gray-400 mb-1">{title}</p>
      <p className="text-xs text-gray-600 max-w-xs">{description}</p>
    </div>
  );
}

export default function EmptyDashboard() {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="card bg-gradient-to-br from-gray-900 to-gray-900 border-gray-800">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white mb-1">
              No analysis yet
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Enter a repository path above and click{' '}
              <span className="text-gray-300 font-medium">Analyze Repository</span>{' '}
              to begin. Doctor Dev will scan your project for testing gaps and
              configuration issues.
            </p>
          </div>
        </div>

        {/* What Doctor Dev finds */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <Microscope className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-300 mb-0.5">TestPilot</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Finds important behavior with no test coverage — functions, routes, error paths, edge cases.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <Settings2 className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-300 mb-0.5">ConfigDoctor</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Detects missing env vars, Docker/CI inconsistencies, secrets in code, and port mismatches.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <EmptyState
          icon={<Shield className="w-6 h-6" />}
          title="Repository Overview"
          description="Stack detection, file counts, dependencies, test frameworks."
        />
        <EmptyState
          icon={<Microscope className="w-6 h-6" />}
          title="Test Health"
          description="Estimated coverage, test files, uncovered symbols and routes."
        />
        <EmptyState
          icon={<Settings2 className="w-6 h-6" />}
          title="Configuration Health"
          description="Environment variables, Docker, CI, ports, and secret scanning."
        />
      </div>

      <div className="card text-center py-8">
        <p className="text-xs text-gray-600">
          Analyze a repository to begin.
        </p>
      </div>
    </div>
  );
}
