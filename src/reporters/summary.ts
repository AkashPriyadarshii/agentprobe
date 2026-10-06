import { AuditReport } from '../types/index.js';
import { generateBadge } from './badge.js';

export function formatGitHubStepSummary(report: AuditReport): string {
  const badge = generateBadge(report.totalScore);
  const statusEmoji = report.passed ? '✅ PASSED' : '❌ FAILED';

  const rows = [
    `| Pillar | Score | Status |`,
    `| :--- | :---: | :---: |`,
    `| **Bot Accessibility** | ${report.pillars.crawler.score} / ${report.pillars.crawler.maxScore} | ${report.pillars.crawler.score >= 16 ? '🟢 Pass' : '🟡 Warn'} |`,
    `| **LLM Manifest (llms.txt)** | ${report.pillars.llmstxt.score} / ${report.pillars.llmstxt.maxScore} | ${report.pillars.llmstxt.score >= 16 ? '🟢 Pass' : '🔴 Needs work'} |`,
    `| **Structured Context** | ${report.pillars.semantic.score} / ${report.pillars.semantic.maxScore} | ${report.pillars.semantic.score >= 16 ? '🟢 Pass' : '🟡 Warn'} |`,
    `| **Actionability & Negotiation** | ${report.pillars.actionability.score} / ${report.pillars.actionability.maxScore} | ${report.pillars.actionability.score >= 16 ? '🟢 Pass' : '🟡 Warn'} |`,
    `| **Protocol Discovery & Commerce** | ${report.pillars.protocols.score} / ${report.pillars.protocols.maxScore} | ${report.pillars.protocols.score >= 16 ? '🟢 Pass' : '🟡 Warn'} |`,
  ];

  let fixes = '';
  if (report.quickFixes.length > 0) {
    fixes = `\n### 🛠️ Top Fixes to Improve Agent Readiness\n` +
      report.quickFixes.slice(0, 6).map((f) => `- ${f}`).join('\n') + '\n';
  }

  return `## 🤖 AgentProbe Audit Report: ${report.target}

**Status:** ${statusEmoji} (Score: **${report.totalScore}/100**, Minimum required: ${report.minScoreThreshold})  
${badge}

${rows.join('\n')}
${fixes}
---
*Audited with [agentprobe](https://github.com/AkashPriyadarshii/agentprobe)*
`;
}
