import { AuditReport } from '../types/index.js';

export function formatJsonReport(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}
