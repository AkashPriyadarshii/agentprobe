export type RuleStatus = 'pass' | 'fail' | 'warn';
export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface AuditCheck {
  id: string;
  name: string;
  description: string;
  status: RuleStatus;
  score: number; // 0 to maxScore
  maxScore: number;
  details?: string;
  recommendation?: string;
}

export interface PillarResult {
  name: string;
  score: number; // 0 to maxScore
  maxScore: number;
  checks: AuditCheck[];
}

export interface AuditReport {
  version: string;
  target: string;
  timestamp: string;
  durationMs: number;
  grade: Grade;
  totalScore: number; // 0 to 100
  passed: boolean;
  minScoreThreshold: number;
  pillars: {
    crawler: PillarResult;
    llmstxt: PillarResult;
    semantic: PillarResult;
    actionability: PillarResult;
    protocols: PillarResult;
  };
  summary: {
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    totalChecks: number;
  };
  quickFixes: string[];
}

export interface AuditOptions {
  minScore?: number;
  json?: boolean;
  plain?: boolean;
  summary?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  fix?: boolean;
}
