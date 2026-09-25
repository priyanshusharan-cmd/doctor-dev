import { GitBranch, FileCode2, FlaskConical, Package, Terminal, Globe, CheckCircle2, XCircle } from 'lucide-react';
import type { RepositoryProfile } from '../types';

interface Props { meta: RepositoryProfile }

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'green' | 'blue' | 'purple' }) {
  const cls = {
    default: 'bg-gray-800/70 border-gray-700/60 text-gray-300',
    green:   'bg-green-950/50 border-green-800/50 text-green-400',
    blue:    'bg-blue-950/50 border-blue-800/50 text-blue-400',
    purple:  'bg-purple-950/50 border-purple-800/50 text-purple-400',
  }[variant];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium font-mono ${cls}`}>
      {children}
    </span>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800/50 last:border-0">
      <div className="w-4 h-4 mt-0.5 text-gray-600 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-600 mb-1.5 font-medium uppercase tracking-wide">{label}</p>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  );
}

function PresenceBadge({ label, present }: { label: string; present: boolean }) {
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border ${
      present ? 'text-green-400 border-green-800/40 bg-green-950/20' : 'text-gray-600 border-gray-700/40 bg-gray-800/20'
    }`}>
      {present ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </div>
  );
}

export default function RepoOverviewCard({ meta }: Props) {
  const depCount = Object.keys(meta.dependencies).length;
  const devDepCount = Object.keys(meta.devDependencies).length;

  return (
    <div className="card rounded-2xl h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-800/60">
        <div>
          <h2 className="text-lg font-bold text-white">{meta.name}</h2>
          {meta.description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{meta.description}</p>}
        </div>
        <Chip variant="blue">{meta.language}</Chip>
      </div>

      <div className="flex-1 divide-y divide-gray-800/30">
        <Row icon={<FileCode2 />} label="Files">
          <Chip>{meta.sourceFiles.length} source</Chip>
          <Chip variant="purple">{meta.testFiles.length} test</Chip>
          <Chip>{meta.totalFiles} total</Chip>
        </Row>

        <Row icon={<FlaskConical />} label="Test frameworks">
          {meta.testFrameworks.length > 0
            ? meta.testFrameworks.map((f) => <Chip key={f} variant="purple">{f}</Chip>)
            : <span className="text-xs text-gray-600">None detected</span>}
        </Row>

        <Row icon={<Package />} label="Dependencies">
          <Chip variant="blue">{meta.packageManager}</Chip>
          <Chip>{depCount} prod</Chip>
          <Chip>{devDepCount} dev</Chip>
        </Row>

        {meta.framework && (
          <Row icon={<Globe />} label="Framework"><Chip variant="green">{meta.framework}</Chip></Row>
        )}
        {meta.nodeVersion && (
          <Row icon={<Terminal />} label="Node"><Chip>{meta.nodeVersion}</Chip></Row>
        )}
        {meta.gitRemote && (
          <Row icon={<GitBranch />} label="Remote">
            <span className="text-xs text-gray-400 font-mono truncate">{meta.gitRemote}</span>
          </Row>
        )}

        {/* Presence indicators */}
        <div className="pt-3 flex flex-wrap gap-2">
          <PresenceBadge label="Git" present={meta.isGitRepo} />
          <PresenceBadge label="TypeScript" present={meta.hasTypes} />
          <PresenceBadge label="Monorepo" present={meta.isMonorepo} />
        </div>
      </div>
    </div>
  );
}
