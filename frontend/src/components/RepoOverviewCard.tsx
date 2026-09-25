import { GitBranch, FileCode2, FlaskConical, Package, Terminal, Globe } from 'lucide-react';
import type { RepositoryProfile } from '../types';

interface Props { meta: RepositoryProfile }

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-300 font-mono">
      {children}
    </span>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-800 last:border-0">
      <div className="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  );
}

export default function RepoOverviewCard({ meta }: Props) {
  const depCount = Object.keys(meta.dependencies).length;
  const devDepCount = Object.keys(meta.devDependencies).length;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-white">{meta.name}</h2>
          {meta.description && <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>}
        </div>
        <Chip>{meta.language}</Chip>
      </div>

      <div className="divide-y divide-gray-800">
        <Row icon={<FileCode2 />} label="Files">
          <Chip>{meta.sourceFiles.length} source</Chip>
          <Chip>{meta.testFiles.length} test</Chip>
          <Chip>{meta.totalFiles} total</Chip>
        </Row>

        <Row icon={<FlaskConical />} label="Test frameworks">
          {meta.testFrameworks.length > 0
            ? meta.testFrameworks.map((f) => <Chip key={f}>{f}</Chip>)
            : <span className="text-xs text-gray-600">None detected</span>}
        </Row>

        <Row icon={<Package />} label="Dependencies">
          <Chip>{meta.packageManager}</Chip>
          <Chip>{depCount} prod</Chip>
          <Chip>{devDepCount} dev</Chip>
        </Row>

        {meta.framework && (
          <Row icon={<Globe />} label="Framework"><Chip>{meta.framework}</Chip></Row>
        )}
        {meta.nodeVersion && (
          <Row icon={<Terminal />} label="Node"><Chip>{meta.nodeVersion}</Chip></Row>
        )}
        {meta.gitRemote && (
          <Row icon={<GitBranch />} label="Remote">
            <span className="text-xs text-gray-400 font-mono truncate">{meta.gitRemote}</span>
          </Row>
        )}
      </div>
    </div>
  );
}
