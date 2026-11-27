import { describe, it, expect } from 'vitest';
import { calculateMaturityLevel, calculateReport } from '../src/core/scorer.js';
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

  it('calculates total score across 5 pillars and passes when score >= threshold', () => {
    const report = calculateReport(
      'https://example.com',
      {
        crawler: dummyPillar(20, 20),
        llmstxt: dummyPillar(20, 20),
        semantic: dummyPillar(16, 20),
        actionability: dummyPillar(16, 20),
        protocols: dummyPillar(18, 20),
      },
      80
    );

    expect(report.totalScore).toBe(90);
    expect(report.grade).toBe('A');
    expect(report.passed).toBe(true);
    expect(report.summary.passedChecks).toBe(2);
    expect(report.summary.failedChecks).toBe(3);
    expect(report.quickFixes).toHaveLength(3);
  });

  it('fails when total score is below minScore threshold', () => {
    const report = calculateReport(
      'https://example.com',
      {
        crawler: dummyPillar(10, 20),
        llmstxt: dummyPillar(0, 20),
        semantic: dummyPillar(10, 20),
        actionability: dummyPillar(5, 20),
        protocols: dummyPillar(5, 20),
      },
      80
    );

    expect(report.totalScore).toBe(30);
    expect(report.grade).toBe('F');
    expect(report.passed).toBe(false);
  });

  it('correctly assigns grades across grade bands', () => {
    const makeScoreReport = (scorePerPillar: number) =>
      calculateReport(
        'https://example.com',
        {
          crawler: dummyPillar(scorePerPillar, 20),
          llmstxt: dummyPillar(scorePerPillar, 20),
          semantic: dummyPillar(scorePerPillar, 20),
          actionability: dummyPillar(scorePerPillar, 20),
          protocols: dummyPillar(scorePerPillar, 20),
        },
        80,
        150
      );

    expect(makeScoreReport(20).grade).toBe('A+');
    expect(makeScoreReport(20).maturityLevel).toBe('L5');
    expect(makeScoreReport(20).durationMs).toBe(150);
    expect(makeScoreReport(17).grade).toBe('A');
    expect(makeScoreReport(17).maturityLevel).toBe('L4');
    expect(makeScoreReport(15).grade).toBe('B');
    expect(makeScoreReport(15).maturityLevel).toBe('L4');
    expect(makeScoreReport(13).grade).toBe('C');
    expect(makeScoreReport(13).maturityLevel).toBe('L3');
    expect(makeScoreReport(9).grade).toBe('D');
    expect(makeScoreReport(9).maturityLevel).toBe('L2');
    expect(makeScoreReport(5).grade).toBe('F');
    expect(makeScoreReport(5).maturityLevel).toBe('L1');
    expect(makeScoreReport(3).maturityLevel).toBe('L0');
  });

  it('maps boundary scores to L0-L5 maturity levels', () => {
    expect(calculateMaturityLevel(0)).toBe('L0');
    expect(calculateMaturityLevel(19)).toBe('L0');
    expect(calculateMaturityLevel(20)).toBe('L1');
    expect(calculateMaturityLevel(39)).toBe('L1');
    expect(calculateMaturityLevel(40)).toBe('L2');
    expect(calculateMaturityLevel(59)).toBe('L2');
    expect(calculateMaturityLevel(60)).toBe('L3');
    expect(calculateMaturityLevel(74)).toBe('L3');
    expect(calculateMaturityLevel(75)).toBe('L4');
    expect(calculateMaturityLevel(89)).toBe('L4');
    expect(calculateMaturityLevel(90)).toBe('L5');
    expect(calculateMaturityLevel(100)).toBe('L5');
  });
});
