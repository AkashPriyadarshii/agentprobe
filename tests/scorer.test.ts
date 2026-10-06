import { describe, it, expect } from 'vitest';
import { calculateReport } from '../src/core/scorer.js';
import { PillarResult } from '../src/types/index.js';

describe('Scorer', () => {
  const dummyPillar = (score: number, maxScore: number): PillarResult => ({
    name: 'Test Pillar',
    score,
    maxScore,
    checks: [
      {
        id: 'test-check',
        name: 'Test Check',
        description: 'Test description',
        status: score === maxScore ? 'pass' : 'fail',
        score,
        maxScore,
        recommendation: score === maxScore ? undefined : 'Fix test issue',
      },
    ],
  });

  it('calculates total score and passes when score >= threshold', () => {
    const report = calculateReport(
      'https://example.com',
      {
        crawler: dummyPillar(25, 25),
        llmstxt: dummyPillar(25, 25),
        semantic: dummyPillar(20, 25),
        actionability: dummyPillar(20, 25),
      },
      80
    );

    expect(report.totalScore).toBe(90);
    expect(report.passed).toBe(true);
    expect(report.summary.passedChecks).toBe(2);
    expect(report.summary.failedChecks).toBe(2);
    expect(report.quickFixes).toHaveLength(2);
  });

  it('fails when total score is below minScore threshold', () => {
    const report = calculateReport(
      'https://example.com',
      {
        crawler: dummyPillar(10, 25),
        llmstxt: dummyPillar(0, 25),
        semantic: dummyPillar(10, 25),
        actionability: dummyPillar(10, 25),
      },
      80
    );

    expect(report.totalScore).toBe(30);
    expect(report.passed).toBe(false);
  });
});
