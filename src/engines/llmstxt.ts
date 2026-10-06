import { PillarResult, AuditCheck } from '../types/index.js';

export interface LLMsTxtAuditInput {
  url: string;
  llmsTxtContent?: string;
  statusCode?: number;
  fullStatusCode?: number;
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Standard rule of thumb: ~4 characters per token for English text/markdown
  return Math.ceil(text.length / 4);
}

export async function auditLLMsTxt(input: LLMsTxtAuditInput): Promise<PillarResult> {
  const checks: AuditCheck[] = [];
  const baseTarget = new URL(input.url);
  const llmsUrl = `${baseTarget.origin}/llms.txt`;
  const llmsFullUrl = `${baseTarget.origin}/llms-full.txt`;

  let content = input.llmsTxtContent;
  let status = input.statusCode;
  let fullStatus = input.fullStatusCode;

  if (content === undefined) {
    try {
      const res = await fetch(llmsUrl, {
        headers: { 'User-Agent': 'agentprobe/0.0.1' },
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      if (res.ok) {
        content = await res.text();
      }
    } catch {
      status = 0;
    }
  }

  if (fullStatus === undefined) {
    try {
      const resFull = await fetch(llmsFullUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'agentprobe/0.0.1' },
        signal: AbortSignal.timeout(4000),
      });
      fullStatus = resFull.status;
    } catch {
      fullStatus = 0;
    }
  }

  // Check 1: llms.txt Availability
  if (status === 200 && content && content.trim().length > 0) {
    checks.push({
      id: 'llms-exists',
      name: 'llms.txt Manifest Found',
      description: 'Site publishes a standardized /llms.txt file for AI agent context',
      status: 'pass',
      score: 10,
      maxScore: 10,
      details: `Reachable at /llms.txt (${content.length} bytes)`,
    });
  } else {
    checks.push({
      id: 'llms-exists',
      name: 'llms.txt Manifest Found',
      description: 'Site publishes a standardized /llms.txt file for AI agent context',
      status: 'fail',
      score: 0,
      maxScore: 10,
      details: status ? `Status code: ${status}` : 'Not found or unreachable',
      recommendation: 'Run "npx agentprobe init" or create /llms.txt in your public root.',
    });
  }

  // Check 2: Spec structure compliance
  if (content && content.trim().length > 0) {
    const hasH1 = /^#\s+.+/m.test(content);
    const hasBlockquote = /^>\s+.+/m.test(content);
    const hasLinks = /-\s+\[.+\]\(.+\)/m.test(content);

    let formatScore = 0;
    const formatIssues: string[] = [];

    if (hasH1) formatScore += 3;
    else formatIssues.push('Missing H1 title ("# Project Name")');

    if (hasBlockquote) formatScore += 2;
    else formatIssues.push('Missing blockquote summary ("> Short description")');

    if (hasLinks) formatScore += 3;
    else formatIssues.push('Missing structured markdown link list ("- [Title](url): desc")');

    if (formatScore === 8) {
      checks.push({
        id: 'llms-spec-structure',
        name: 'llms.txt Spec Compliance',
        description: 'Follows standard llms.txt formatting with H1, blockquote, and curated links',
        status: 'pass',
        score: 8,
        maxScore: 8,
        details: 'Valid H1 title, summary blockquote, and structured link index.',
      });
    } else {
      checks.push({
        id: 'llms-spec-structure',
        name: 'llms.txt Spec Compliance',
        description: 'Follows standard llms.txt formatting with H1, blockquote, and curated links',
        status: 'warn',
        score: formatScore,
        maxScore: 8,
        details: `Format issues: ${formatIssues.join(', ')}`,
        recommendation: 'Format /llms.txt with: # Title, > One-sentence summary, and ## Sections with markdown link items.',
      });
    }

    // Check 3: Token budget efficiency
    const estimatedTokens = estimateTokenCount(content);
    if (estimatedTokens <= 15000) {
      checks.push({
        id: 'llms-token-budget',
        name: 'Token Budget Efficiency',
        description: 'llms.txt is compact and token-efficient for agent context windows',
        status: 'pass',
        score: 3,
        maxScore: 3,
        details: `Estimated tokens: ~${estimatedTokens.toLocaleString()} (within 15,000 budget)`,
      });
    } else {
      checks.push({
        id: 'llms-token-budget',
        name: 'Token Budget Efficiency',
        description: 'llms.txt is compact and token-efficient for agent context windows',
        status: 'warn',
        score: 1,
        maxScore: 3,
        details: `Estimated tokens: ~${estimatedTokens.toLocaleString()} (exceeds recommended 15,000)`,
        recommendation: 'Move extensive documentation to /llms-full.txt and keep /llms.txt as a concise index.',
      });
    }
  } else {
    checks.push({
      id: 'llms-spec-structure',
      name: 'llms.txt Spec Compliance',
      description: 'Follows standard llms.txt formatting with H1, blockquote, and curated links',
      status: 'fail',
      score: 0,
      maxScore: 8,
      details: 'No /llms.txt file to parse.',
      recommendation: 'Create a compliant /llms.txt file.',
    });
    checks.push({
      id: 'llms-token-budget',
      name: 'Token Budget Efficiency',
      description: 'llms.txt is compact and token-efficient for agent context windows',
      status: 'fail',
      score: 0,
      maxScore: 3,
      details: 'No manifest content available.',
    });
  }

  // Check 4: Full Documentation Manifest (/llms-full.txt)
  if (fullStatus === 200) {
    checks.push({
      id: 'llms-full-exists',
      name: 'Full LLM Knowledge Manifest (/llms-full.txt)',
      description: 'Provides /llms-full.txt for comprehensive agent training and RAG ingestion',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: 'Found /llms-full.txt companion manifest',
    });
  } else {
    checks.push({
      id: 'llms-full-exists',
      name: 'Full LLM Knowledge Manifest (/llms-full.txt)',
      description: 'Provides /llms-full.txt for comprehensive agent training and RAG ingestion',
      status: 'warn',
      score: 1,
      maxScore: 4,
      details: 'No /llms-full.txt detected (optional but recommended for deep technical docs)',
      recommendation: 'Optionally bundle your full markdown documentation at /llms-full.txt.',
    });
  }

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    name: 'LLM Manifest (llms.txt)',
    score,
    maxScore,
    checks,
  };
}
