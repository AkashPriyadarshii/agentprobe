import * as cheerio from 'cheerio';
import { PillarResult, AuditCheck } from '../types/index.js';

export interface MarkdownProbeResult {
  supported: boolean;
  xMarkdownTokens?: number;
  varyAccept?: boolean;
  soft404Detected?: boolean;
  soft404Status?: number;
}

export interface ActionabilityAuditInput {
  url: string;
  html: string;
  markdownNegotiationSupported?: boolean | MarkdownProbeResult;
  soft404Detected?: boolean;
  xMarkdownTokens?: number;
  varyAccept?: boolean;
}

export async function probeSoft404(
  url: string
): Promise<{ soft404Detected: boolean; status: number } | undefined> {
  try {
    const baseTarget = new URL(url);
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const probeUrl = `${baseTarget.origin}/.agentprobe-404-check-${nonce}`;

    const res = await fetch(probeUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.status === 200) {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
        return { soft404Detected: true, status: res.status };
      }
      if (!ct) {
        const body = await res.text().catch(() => '');
        const isHtml = /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(body);
        return { soft404Detected: isHtml, status: res.status };
      }
    }

    return { soft404Detected: false, status: res.status };
  } catch {
    return undefined;
  }
}

export async function testMarkdownNegotiation(url: string): Promise<MarkdownProbeResult> {
  const [mdRes, soft404] = await Promise.all([
    fetch(url, {
      headers: {
        'Accept': 'text/markdown, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'agentprobe/0.0.2 (Agentic Web Readiness Audit)',
      },
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined),
    probeSoft404(url),
  ]);

  if (!mdRes) {
    return {
      supported: false,
      soft404Detected: soft404?.soft404Detected,
      soft404Status: soft404?.status,
    };
  }

  const contentType = (mdRes.headers.get('content-type') || '').toLowerCase();
  const hasMarkdownHeader = mdRes.headers.has('x-markdown');
  const rawTokens = mdRes.headers.get('x-markdown-tokens');
  const parsedTokens = rawTokens !== null ? Number.parseInt(rawTokens, 10) : Number.NaN;
  const xMarkdownTokens = !Number.isNaN(parsedTokens) && parsedTokens >= 0 ? parsedTokens : undefined;

  const varyHeader = mdRes.headers.get('vary') || '';
  const varyAccept = varyHeader
    .split(',')
    .some((token) => {
      const normalized = token.trim().toLowerCase();
      return normalized === 'accept' || normalized === '*';
    });

  const supported =
    contentType.includes('text/markdown') ||
    hasMarkdownHeader ||
    xMarkdownTokens !== undefined;

  return {
    supported,
    xMarkdownTokens,
    varyAccept,
    soft404Detected: soft404?.soft404Detected,
    soft404Status: soft404?.status,
  };
}

export function auditActionability(input: ActionabilityAuditInput): PillarResult {
  const checks: AuditCheck[] = [];
  const $ = cheerio.load(input.html);

  const probe =
    typeof input.markdownNegotiationSupported === 'object' &&
    input.markdownNegotiationSupported !== null
      ? input.markdownNegotiationSupported
      : undefined;

  const markdownSupported = probe
    ? probe.supported
    : Boolean(input.markdownNegotiationSupported);
  const xMarkdownTokens = input.xMarkdownTokens ?? probe?.xMarkdownTokens;
  const varyAccept = input.varyAccept ?? probe?.varyAccept;
  const soft404Detected = input.soft404Detected ?? probe?.soft404Detected;

  // Check 1: Markdown Content Negotiation + x-markdown-tokens / Vary: Accept (6 pts)
  if (markdownSupported) {
    const metaParts: string[] = [];
    if (xMarkdownTokens !== undefined) {
      metaParts.push(`x-markdown-tokens: ${xMarkdownTokens}`);
    }
    if (varyAccept === true) {
      metaParts.push('Vary: Accept present');
    } else if (varyAccept === false) {
      metaParts.push('Vary: Accept missing');
    }
    const extra = metaParts.length > 0 ? ` (${metaParts.join(', ')})` : '';
    const score = varyAccept === false ? 5 : 6;
    checks.push({
      id: 'action-markdown-negotiation',
      name: 'Markdown Content Negotiation',
      description: 'Server returns clean markdown when requested via Accept: text/markdown header',
      status: 'pass',
      score,
      maxScore: 6,
      details: `Server responds with text/markdown for agent requests${extra}.`,
      recommendation:
        varyAccept === false
          ? 'Add "Vary: Accept" header to markdown responses so caches do not mix HTML and Markdown.'
          : undefined,
    });
  } else {
    const varyNote = varyAccept ? ' (Vary: Accept header detected, but HTML was returned)' : '';
    checks.push({
      id: 'action-markdown-negotiation',
      name: 'Markdown Content Negotiation',
      description: 'Server returns clean markdown when requested via Accept: text/markdown header',
      status: 'warn',
      score: 2,
      maxScore: 6,
      details: `Server returns standard HTML on Accept: text/markdown requests${varyNote}.`,
      recommendation: 'Support content negotiation (Accept: text/markdown with Vary: Accept and x-markdown-tokens) to serve lightweight Markdown to AI agents.',
    });
  }

  // Check 2: Interactive Buttons Accessibility (4 pts)
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
      score: 4,
      maxScore: 4,
      details: 'No interactive buttons detected on page.',
    });
  } else if (unlabeledButtons === 0) {
    checks.push({
      id: 'action-button-labels',
      name: 'Interactive Button Actionability',
      description: 'All buttons have accessible names for autonomous clicking and navigation',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: `All ${buttons.length} button(s) have accessible text or aria-labels.`,
    });
  } else {
    checks.push({
      id: 'action-button-labels',
      name: 'Interactive Button Actionability',
      description: 'All buttons have accessible names for autonomous clicking and navigation',
      status: 'warn',
      score: Math.max(0, 4 - unlabeledButtons * 2),
      maxScore: 4,
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

  // Check 4: Pre-rendered Body Content & HTML-to-Text Token Density Ratio (4 pts)
  const $bodyClone = $('body').clone();
  const scriptCount = $('script').length;
  $bodyClone.find('script, style, noscript').remove();
  const bodyText = $bodyClone.text().replace(/\s+/g, ' ').trim();
  const textTokens = Math.ceil(bodyText.length / 4);
  const htmlTokens = Math.ceil(input.html.length / 4);
  const tokenDensity = htmlTokens > 0 ? textTokens / htmlTokens : 0;
  const densityPct = (tokenDensity * 100).toFixed(1);

  if (bodyText.length > 200 && tokenDensity >= 0.05) {
    checks.push({
      id: 'action-prerendered-content',
      name: 'Static / SSR Content & Token Density',
      description: 'Content is pre-rendered with healthy text-to-HTML token density without hydration bloat',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: `Pre-rendered content detected (~${bodyText.length} chars, ${densityPct}% text-to-HTML token density: ${textTokens}/${htmlTokens} tokens).`,
    });
  } else if (bodyText.length > 200) {
    checks.push({
      id: 'action-prerendered-content',
      name: 'Static / SSR Content & Token Density',
      description: 'Content is pre-rendered with healthy text-to-HTML token density without hydration bloat',
      status: 'warn',
      score: 2,
      maxScore: 4,
      details: `Low text-to-HTML token density (${densityPct}%, ${textTokens}/${htmlTokens} tokens across ${scriptCount} scripts).`,
      recommendation: 'Reduce inline hydration/script bloat or serve Markdown negotiation so agents do not waste context tokens on HTML.',
    });
  } else {
    checks.push({
      id: 'action-prerendered-content',
      name: 'Static / SSR Content & Token Density',
      description: 'Content is pre-rendered with healthy text-to-HTML token density without hydration bloat',
      status: 'fail',
      score: 1,
      maxScore: 4,
      details: `Initial HTML contains very little readable text (${bodyText.length} chars, ${densityPct}% token density) with ${scriptCount} scripts.`,
      recommendation: 'Enable Server-Side Rendering (SSR) or Static Site Generation (SSG). AI crawlers often do not execute client-side JS.',
    });
  }

  // Check 5: Soft-404 Trap Detection (2 pts)
  if (soft404Detected === true) {
    checks.push({
      id: 'action-soft-404',
      name: 'Soft-404 Status Integrity',
      description: 'Non-existent routes return HTTP 404/410 instead of a 200 OK HTML catch-all shell',
      status: 'fail',
      score: 0,
      maxScore: 2,
      details: 'Probe to /.agentprobe-404-check-... returned HTTP 200 HTML (SPA catch-all soft-404).',
      recommendation: 'Return HTTP 404 for unknown paths rather than serving a 200 OK fallback HTML shell.',
    });
  } else {
    checks.push({
      id: 'action-soft-404',
      name: 'Soft-404 Status Integrity',
      description: 'Non-existent routes return HTTP 404/410 instead of a 200 OK HTML catch-all shell',
      status: 'pass',
      score: 2,
      maxScore: 2,
      details:
        soft404Detected === false
          ? 'Unknown probe route (/.agentprobe-404-check-...) properly returned a non-200 status.'
          : 'No soft-404 catch-all detected.',
    });
  }

  // Check 6: WebMCP Detection (advisory check: toolname attributes & navigator.modelContext)
  const toolNameElements = $('[toolname]');
  const toolNames: string[] = [];
  toolNameElements.each((_, el) => {
    const val = $(el).attr('toolname')?.trim();
    if (val) toolNames.push(val);
  });
  const hasModelContext = /\bnavigator\.modelContext\b/.test(input.html);

  if (toolNameElements.length > 0 || hasModelContext) {
    const signals: string[] = [];
    if (toolNameElements.length > 0) {
      signals.push(`${toolNameElements.length} [toolname] element(s)${toolNames.length > 0 ? ` (${toolNames.slice(0, 5).join(', ')})` : ''}`);
    }
    if (hasModelContext) {
      signals.push('navigator.modelContext API');
    }
    checks.push({
      id: 'action-webmcp',
      name: 'WebMCP Tool Exposure',
      description: 'Detects declarative toolname attributes or imperative navigator.modelContext bindings',
      status: 'pass',
      score: 0,
      maxScore: 0,
      details: `WebMCP signals detected: ${signals.join(' + ')}.`,
    });
  } else {
    checks.push({
      id: 'action-webmcp',
      name: 'WebMCP Tool Exposure',
      description: 'Detects declarative toolname attributes or imperative navigator.modelContext bindings',
      status: 'warn',
      score: 0,
      maxScore: 0,
      details: 'No WebMCP declarations (toolname attributes or navigator.modelContext) detected.',
      recommendation: 'Expose browser-callable actions via WebMCP toolname attributes on forms or navigator.modelContext.registerTool().',
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
