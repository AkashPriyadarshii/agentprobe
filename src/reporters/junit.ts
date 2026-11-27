import { AuditReport } from '../types/index.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatJunitReport(report: AuditReport): string {
  const totalTimeSec = (report.durationMs / 1000).toFixed(3);
  const totalTests = report.summary.totalChecks;
  const totalFailures = report.summary.failedChecks;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="agentprobe" tests="${totalTests}" failures="${totalFailures}" errors="0" time="${totalTimeSec}">`,
  ];

  for (const [pillarKey, pillar] of Object.entries(report.pillars)) {
    const suiteFailures = pillar.checks.filter((c) => c.status === 'fail').length;
    lines.push(
      `  <testsuite name="${escapeXml(pillar.name)}" tests="${pillar.checks.length}" failures="${suiteFailures}" errors="0" skipped="0">`
    );

    for (const check of pillar.checks) {
      const classname = `agentprobe.${pillarKey}`;
      const caseTag = `    <testcase classname="${escapeXml(classname)}" name="${escapeXml(check.name)}" time="0.000">`;

      if (check.status === 'fail') {
        const message = check.details || check.description;
        const body = [check.details, check.recommendation].filter(Boolean).join('\n') || check.description;
        lines.push(caseTag);
        lines.push(`      <failure message="${escapeXml(message)}" type="fail">${escapeXml(body)}</failure>`);
        lines.push('    </testcase>');
      } else if (check.status === 'warn') {
        const note = [`WARN (${check.score}/${check.maxScore})`, check.details, check.recommendation]
          .filter(Boolean)
          .join(' — ');
        lines.push(caseTag);
        lines.push(`      <system-out>${escapeXml(note)}</system-out>`);
        lines.push('    </testcase>');
      } else {
        lines.push(
          `    <testcase classname="${escapeXml(classname)}" name="${escapeXml(check.name)}" time="0.000" />`
        );
      }
    }

    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');
  return lines.join('\n');
}
