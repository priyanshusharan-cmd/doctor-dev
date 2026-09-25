import type { GapSeverity, IssueSeverity, FindingLevel, HealthScore } from '../types';

export const GAP_CATEGORY_LABELS: Record<string, string> = {
  no_test:                 'No Test Coverage',
  missing_error_test:      'Error Path Not Tested',
  missing_edge_case:       'Edge Cases Missing',
  missing_auth_test:       'Auth Not Tested',
  missing_integration_test:'Integration Test Missing',
  partial_test:            'Partial Coverage',
};

export const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  environment:   'Environment',
  runtime:       'Runtime',
  package:       'Package',
  ports:         'Ports',
  docker:        'Docker',
  ci:            'CI/CD',
  documentation: 'Documentation',
  scripts:       'Scripts',
  security:      'Security',
};

type Severity = GapSeverity | IssueSeverity | FindingLevel;

export function severityBadgeClass(s: Severity): string {
  switch (s) {
    case 'critical': return 'badge-critical';
    case 'high':     return 'badge-high';
    case 'medium':   return 'badge-medium';
    case 'low':      return 'badge-low';
    case 'info':     return 'badge-info';
    default:         return 'badge-low';
  }
}

export function severityBorderClass(s: Severity): string {
  switch (s) {
    case 'critical': return 'border-l-red-500';
    case 'high':     return 'border-l-orange-500';
    case 'medium':   return 'border-l-yellow-500';
    case 'low':      return 'border-l-gray-600';
    case 'info':     return 'border-l-blue-500';
    default:         return 'border-l-gray-600';
  }
}

export function gradeColor(grade: HealthScore['grade']): string {
  switch (grade) {
    case 'A': return 'text-green-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
  }
}

export function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  if (score >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

export function shortPath(p: string, segments = 3): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= segments) return p;
  return '…/' + parts.slice(-segments).join('/');
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function confidencePct(c: number): string {
  return `${Math.round(c * 100)}%`;
}

export function stateColor(state: string): string {
  switch (state) {
    case 'healthy':          return 'text-green-400';
    case 'needs_attention':  return 'text-yellow-400';
    case 'critical':         return 'text-red-400';
    default:                 return 'text-gray-400';
  }
}

export function stateLabel(state: string): string {
  switch (state) {
    case 'healthy':         return 'Healthy';
    case 'needs_attention': return 'Needs Attention';
    case 'critical':        return 'Critical Issues';
    default:                return 'Unknown';
  }
}
