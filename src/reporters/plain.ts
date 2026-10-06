import { AuditReport } from '../types/index.js';

export function formatPlainReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`AGENTPROBE AUDIT REPORT v${report.version}`);
  lines.push(`TARGET: ${report.target}`);
  lines.push(`AUDITED: ${report.timestamp} (${(report.durationMs / 1000).toFixed(2)}s)`);
  lines.push(`SCORE: ${report.totalScore}/100`);
  lines.push(`GRADE: ${report.grade}`);
  lines.push(`GATE: ${report.passed ? 'PASSED' : 'FAILED'} (threshold: ${report.minScoreThreshold})`);
  lines.push('');
  lines.push('PILLARS:');

  for (const pillar of Object.values(report.pillars)) {
    const status = pillar.score >= (pillar.maxScore * 0.8)
      ? 'PASS'
      : pillar.score >= (pillar.maxScore * 0.5)
        ? 'WARN'
        : 'FAIL';
    lines.push(`  - ${pillar.name}: ${pillar.score}/${pillar.maxScore} [${status}]`);
    for (const check of pillar.checks) {
      lines.push(`      * ${check.name}: ${check.score}/${check.maxScore} (${check.status.toUpperCase()})`);
      if (check.recommendation && check.status !== 'pass') {
        lines.push(`        Fix: ${check.recommendation}`);
      }
    }
  }

  if (report.quickFixes.length > 0) {
    lines.push('');
    lines.push('ACTIONABLE FIXES:');
    for (const fix of report.quickFixes) {
      lines.push(`  • ${fix}`);
    }
  }

  return lines.join('\n');
}
