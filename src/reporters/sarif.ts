import { AuditCheck, AuditReport, RuleStatus } from '../types/index.js';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

function toSarifLevel(status: RuleStatus): 'error' | 'warning' | 'note' {
  switch (status) {
    case 'fail':
      return 'error';
    case 'warn':
      return 'warning';
    case 'pass':
      return 'note';
  }
}

function formatCheckMessage(check: AuditCheck): string {
  const parts = [check.details, check.recommendation].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : check.description;
}

export function formatSarifReport(report: AuditReport): string {
  const rules: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];

  for (const [pillarKey, pillar] of Object.entries(report.pillars)) {
    for (const check of pillar.checks) {
      rules.push({
        id: check.id,
        name: check.name,
        shortDescription: { text: check.name },
        fullDescription: { text: check.description },
        help: { text: check.recommendation || check.description },
        defaultConfiguration: {
          level: toSarifLevel(check.status),
        },
        properties: {
          pillar: pillarKey,
          pillarName: pillar.name,
          maxScore: check.maxScore,
        },
      });

      if (check.status !== 'pass') {
        results.push({
          ruleId: check.id,
          level: toSarifLevel(check.status),
          message: {
            text: formatCheckMessage(check),
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: report.target,
                },
              },
            },
          ],
          properties: {
            score: check.score,
            maxScore: check.maxScore,
            status: check.status,
          },
        });
      }
    }
  }

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'agentprobe',
            version: report.version,
            informationUri: 'https://github.com/AkashPriyadarshii/agentprobe',
            rules,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: report.passed,
            endTimeUtc: report.timestamp,
          },
        ],
        properties: {
          target: report.target,
          totalScore: report.totalScore,
          grade: report.grade,
          passed: report.passed,
          minScoreThreshold: report.minScoreThreshold,
        },
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
