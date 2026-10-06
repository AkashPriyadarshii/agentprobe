import * as cheerio from 'cheerio';
import { PillarResult, AuditCheck } from '../types/index.js';

export interface ActionabilityAuditInput {
  url: string;
  html: string;
  markdownNegotiationSupported?: boolean;
}

export async function testMarkdownNegotiation(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/markdown, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
      },
      signal: AbortSignal.timeout(4000),
    });

    const contentType = res.headers.get('content-type') || '';
    const hasMarkdownHeader = res.headers.has('x-markdown');
    return contentType.includes('text/markdown') || hasMarkdownHeader;
  } catch {
    return false;
  }
}

export function auditActionability(input: ActionabilityAuditInput): PillarResult {
  const checks: AuditCheck[] = [];
  const $ = cheerio.load(input.html);

  // Check 1: Markdown Content Negotiation (7 pts)
  if (input.markdownNegotiationSupported) {
    checks.push({
      id: 'action-markdown-negotiation',
      name: 'Markdown Content Negotiation',
      description: 'Server returns clean markdown when requested via Accept: text/markdown header',
      status: 'pass',
      score: 7,
      maxScore: 7,
      details: 'Server responds with text/markdown for agent requests (zero HTML scrape bloat).',
    });
  } else {
    checks.push({
      id: 'action-markdown-negotiation',
      name: 'Markdown Content Negotiation',
      description: 'Server returns clean markdown when requested via Accept: text/markdown header',
      status: 'warn',
      score: 2,
      maxScore: 7,
      details: 'Server returns standard HTML on Accept: text/markdown requests.',
      recommendation: 'Support content negotiation or edge middleware to serve lightweight Markdown to AI user-agents.',
    });
  }

  // Check 2: Interactive Buttons Accessibility (5 pts)
  const buttons = $('button, input[type="button"], input[type="submit"], [role="button"]');
  let unlabeledButtons = 0;

  buttons.each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const ariaLabel = $el.attr('aria-label')?.trim();
    const ariaLabelledBy = $el.attr('aria-labelledby')?.trim();
    const title = $el.attr('title')?.trim();
    const value = $el.attr('value')?.trim();

    if (!text && !ariaLabel && !ariaLabelledBy && !title && !value) {
      unlabeledButtons++;
    }
  });

  if (buttons.length === 0) {
    checks.push({
      id: 'action-button-labels',
      name: 'Interactive Button Actionability',
      description: 'All buttons have accessible names for autonomous clicking and navigation',
      status: 'pass',
      score: 5,
      maxScore: 5,
      details: 'No interactive buttons detected on page.',
    });
  } else if (unlabeledButtons === 0) {
    checks.push({
      id: 'action-button-labels',
      name: 'Interactive Button Actionability',
      description: 'All buttons have accessible names for autonomous clicking and navigation',
      status: 'pass',
      score: 5,
      maxScore: 5,
      details: `All ${buttons.length} button(s) have accessible text or aria-labels.`,
    });
  } else {
    checks.push({
      id: 'action-button-labels',
      name: 'Interactive Button Actionability',
      description: 'All buttons have accessible names for autonomous clicking and navigation',
      status: 'warn',
      score: Math.max(0, 5 - unlabeledButtons * 2),
      maxScore: 5,
      details: `Found ${unlabeledButtons} unlabeled button(s) without text or aria-label.`,
      recommendation: 'Add descriptive aria-label or visible text to icon buttons so browsing agents know what they do.',
    });
  }

  // Check 3: Form Input Actionability (4 pts)
  const inputs = $('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select');
  let unlabeledInputs = 0;

  inputs.each((_, el) => {
    const $el = $(el);
    const id = $el.attr('id');
    const ariaLabel = $el.attr('aria-label')?.trim();
    const placeholder = $el.attr('placeholder')?.trim();
    const name = $el.attr('name')?.trim();
    const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false;

    if (!hasLabel && !ariaLabel && !placeholder && !name) {
      unlabeledInputs++;
    }
  });

  if (inputs.length === 0) {
    checks.push({
      id: 'action-input-labels',
      name: 'Form Inputs & Form Controls',
      description: 'Input fields have labels or placeholders for autonomous agent form filling',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: 'No input fields detected on page.',
    });
  } else if (unlabeledInputs === 0) {
    checks.push({
      id: 'action-input-labels',
      name: 'Form Inputs & Form Controls',
      description: 'Input fields have labels or placeholders for autonomous agent form filling',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: `All ${inputs.length} input field(s) have clear labels/placeholders.`,
    });
  } else {
    checks.push({
      id: 'action-input-labels',
      name: 'Form Inputs & Form Controls',
      description: 'Input fields have labels or placeholders for autonomous agent form filling',
      status: 'warn',
      score: Math.max(0, 4 - unlabeledInputs * 2),
      maxScore: 4,
      details: `Found ${unlabeledInputs} input field(s) without labels or aria-labels.`,
      recommendation: 'Ensure every form input has an associated <label> or aria-label attribute.',
    });
  }

  // Check 4: Pre-rendered Body Content vs Empty SPA Trap (4 pts)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const scriptCount = $('script').length;

  if (bodyText.length > 200) {
    checks.push({
      id: 'action-prerendered-content',
      name: 'Static / SSR Content Availability',
      description: 'Content is available without requiring client-side JS hydration execution',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: `Pre-rendered content detected (~${bodyText.length} characters of initial body text).`,
    });
  } else {
    checks.push({
      id: 'action-prerendered-content',
      name: 'Static / SSR Content Availability',
      description: 'Content is available without requiring client-side JS hydration execution',
      status: 'fail',
      score: 1,
      maxScore: 4,
      details: `Initial HTML contains very little readable text (${bodyText.length} chars) with ${scriptCount} scripts.`,
      recommendation: 'Enable Server-Side Rendering (SSR) or Static Site Generation (SSG). AI crawlers often do not execute client-side JS.',
    });
  }

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    name: 'Actionability & Negotiation',
    score,
    maxScore,
    checks,
  };
}
