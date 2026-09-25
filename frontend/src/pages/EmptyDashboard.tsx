import { Microscope, Settings2, Zap, GitBranch, Shield, ArrowRight, CheckCircle2 } from 'lucide-react';

interface FeatureCardProps {
  icon: React.ReactNode;
  color: string;
  glowClass: string;
  title: string;
  subtitle: string;
  bullets: string[];
}

function FeatureCard({ icon, color, glowClass, title, subtitle, bullets }: FeatureCardProps) {
  return (
    <div className={`card-glass p-6 rounded-2xl border border-white/5 group hover:border-white/10 transition-all duration-300 ${glowClass}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>
        {icon}
      </div>
      <h3 className="text-base font-bold text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">{subtitle}</p>
      <ul className="space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-xs text-gray-400">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-600" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkflowStep({ n, label, sub, color }: { n: number; label: string; sub: string; color: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-2 text-sm font-bold ${color}`}>
        {n}
      </div>
      <p className="text-xs font-semibold text-gray-300">{label}</p>
      <p className="text-xs text-gray-600 mt-0.5 max-w-20">{sub}</p>
    </div>
  );
}

export default function EmptyDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero section */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800/60 p-8"
        style={{ background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9) 0%, rgba(11, 17, 32, 0.95) 100%)' }}>
        {/* Background decoration */}
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-5 blur-3xl"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full opacity-5 blur-3xl"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }} />

        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 bg-blue-950/50 border border-blue-800/50 px-3 py-1 rounded-full">
              <Zap className="w-3 h-3" />
              AI-Powered Analysis
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            Your AI doctor for<br />
            <span className="text-gradient-blue">software health.</span>
          </h1>
          <p className="text-base text-gray-400 leading-relaxed max-w-2xl mb-6">
            Point Doctor Dev at any repository. It diagnoses testing gaps, catches configuration
            problems, and tells you exactly what will break — before your developers find out the hard way.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-6">
            {[
              { value: '2', label: 'Analysis engines' },
              { value: 'AST', label: 'Code analysis' },
              { value: '100%', label: 'Real file scanning' },
            ].map(({ value, label }) => (
              <div key={label}>
                <span className="text-2xl font-bold text-white tabular-nums">{value}</span>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FeatureCard
          icon={<Microscope className="w-5 h-5 text-purple-400" />}
          color="bg-purple-950/60 border border-purple-800/40"
          glowClass="hover:glow-purple"
          title="TestPilot"
          subtitle="Finds what your test suite forgot to cover"
          bullets={[
            'Maps every function to its test coverage',
            'Detects missing error paths & edge cases',
            'Flags untested auth & business logic',
            'Generates test code in your framework',
          ]}
        />
        <FeatureCard
          icon={<Settings2 className="w-5 h-5 text-cyan-400" />}
          color="bg-cyan-950/60 border border-cyan-800/40"
          glowClass="hover:glow-cyan"
          title="ConfigDoctor"
          subtitle="Finds the 'works on my machine' problems"
          bullets={[
            'Detects undocumented env variables',
            'Compares ports across Docker, CI & README',
            'Checks CI vs local environment parity',
            'Scans for accidentally exposed secrets',
          ]}
        />
      </div>

      {/* Workflow */}
      <div className="card rounded-2xl">
        <div className="flex items-center gap-2 mb-5">
          <GitBranch className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">How it works</span>
        </div>
        <div className="flex items-start gap-2 overflow-x-auto pb-2">
          {[
            { n: 1, label: 'Scan', sub: 'File & stack detection', color: 'text-blue-400 border-blue-800/60 bg-blue-950/30' },
            { n: 2, label: 'Analyze', sub: 'AST + route mapping', color: 'text-purple-400 border-purple-800/60 bg-purple-950/30' },
            { n: 3, label: 'Detect', sub: 'Gaps & issues', color: 'text-orange-400 border-orange-800/60 bg-orange-950/30' },
            { n: 4, label: 'Explain', sub: 'Why it matters', color: 'text-yellow-400 border-yellow-800/60 bg-yellow-950/30' },
            { n: 5, label: 'Generate', sub: 'Test suggestions', color: 'text-cyan-400 border-cyan-800/60 bg-cyan-950/30' },
            { n: 6, label: 'Report', sub: 'Health score', color: 'text-green-400 border-green-800/60 bg-green-950/30' },
          ].map((step, i, arr) => (
            <div key={step.n} className="flex items-start gap-2 flex-shrink-0">
              <WorkflowStep {...step} />
              {i < arr.length - 1 && (
                <div className="h-10 flex items-center">
                  <ArrowRight className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA footer */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-900/40 bg-blue-950/10">
        <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <p className="text-sm text-gray-400">
          Enter a repository path above and click{' '}
          <span className="text-gray-200 font-semibold">Analyze Repository</span>
          , or try the{' '}
          <span className="text-gray-200 font-semibold">Demo Repository</span>
          {' '}to see Doctor Dev in action.
        </p>
      </div>
    </div>
  );
}
