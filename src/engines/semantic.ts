import * as cheerio from 'cheerio';
import { PillarResult, AuditCheck } from '../types/index.js';

export interface SemanticAuditInput {
  html: string;
  url: string;
}

export function auditSemanticStructure(input: SemanticAuditInput): PillarResult {
  const checks: AuditCheck[] = [];
  const $ = cheerio.load(input.html);

  // Check 1: HTML5 Landmarks (<main>, <nav>, etc.)
  const hasMain = $('main, [role="main"]').length > 0;
  const hasNav = $('nav, [role="navigation"]').length > 0;
  const hasHeaderOrFooter = $('header, footer, [role="banner"], [role="contentinfo"]').length > 0;

  let landmarkScore = 0;
  const missingLandmarks: string[] = [];

  if (hasMain) landmarkScore += 4;
  else missingLandmarks.push('<main>');

  if (hasNav) landmarkScore += 2;
  else missingLandmarks.push('<nav>');

  if (hasHeaderOrFooter) landmarkScore += 2;
  else missingLandmarks.push('<header>/<footer>');

  if (landmarkScore === 8) {
    checks.push({
      id: 'semantic-landmarks',
      name: 'HTML5 Semantic Landmarks',
      description: 'Page uses <main>, <nav>, and header/footer elements for structural navigation',
      status: 'pass',
      score: 8,
      maxScore: 8,
      details: 'All core landmark elements (<main>, <nav>, header/footer) detected.',
    });
  } else if (landmarkScore >= 4) {
    checks.push({
      id: 'semantic-landmarks',
      name: 'HTML5 Semantic Landmarks',
      description: 'Page uses <main>, <nav>, and header/footer elements for structural navigation',
      status: 'warn',
      score: landmarkScore,
      maxScore: 8,
      details: `Missing semantic landmarks: ${missingLandmarks.join(', ')}`,
      recommendation: `Wrap core content in semantic tags (${missingLandmarks.join(', ')}) so agents can isolate primary text from chrome.`,
    });
  } else {
    checks.push({
      id: 'semantic-landmarks',
      name: 'HTML5 Semantic Landmarks',
      description: 'Page uses <main>, <nav>, and header/footer elements for structural navigation',
      status: 'fail',
      score: 0,
      maxScore: 8,
      details: 'No HTML5 structural landmarks found; content is wrapped in generic divs.',
      recommendation: 'Use <main> for primary article/content and <nav> for site navigation.',
    });
  }

  // Check 2: Heading Hierarchy
  const h1Elements = $('h1');
  const h1Count = h1Elements.length;

  if (h1Count === 1) {
    const h1Text = h1Elements.first().text().trim();
    checks.push({
      id: 'semantic-headings',
      name: 'Heading Structure & Single H1',
      description: 'Clear heading hierarchy helps agents extract topic and context',
      status: 'pass',
      score: 5,
      maxScore: 5,
      details: `Single primary H1 found: "${h1Text.slice(0, 50)}${h1Text.length > 50 ? '...' : ''}"`,
    });
  } else if (h1Count > 1) {
    checks.push({
      id: 'semantic-headings',
      name: 'Heading Structure & Single H1',
      description: 'Clear heading hierarchy helps agents extract topic and context',
      status: 'warn',
      score: 3,
      maxScore: 5,
      details: `Multiple H1 elements found (${h1Count}). Prefer a single top-level title.`,
      recommendation: 'Use one H1 per page for the main topic and H2-H6 for sub-sections.',
    });
  } else {
    checks.push({
      id: 'semantic-headings',
      name: 'Heading Structure & Single H1',
      description: 'Clear heading hierarchy helps agents extract topic and context',
      status: 'fail',
      score: 0,
      maxScore: 5,
      details: 'No H1 element found on the page.',
      recommendation: 'Add a descriptive H1 heading to declare the page topic.',
    });
  }

  // Check 3: Schema.org JSON-LD structured data
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const validSchemas: string[] = [];
  let jsonLdValid = false;

  jsonLdScripts.each((_, el) => {
    try {
      const rawText = $(el).text();
      const parsed = JSON.parse(rawText);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && item['@type']) {
          validSchemas.push(String(item['@type']));
          jsonLdValid = true;
        }
      }
    } catch {
      // JSON parse error
    }
  });

  if (jsonLdValid) {
    checks.push({
      id: 'semantic-jsonld',
      name: 'Schema.org JSON-LD Structured Data',
      description: 'Exposes explicit machine-readable entities via Schema.org JSON-LD',
      status: 'pass',
      score: 8,
      maxScore: 8,
      details: `Found Schema.org types: ${Array.from(new Set(validSchemas)).join(', ')}`,
    });
  } else {
    checks.push({
      id: 'semantic-jsonld',
      name: 'Schema.org JSON-LD Structured Data',
      description: 'Exposes explicit machine-readable entities via Schema.org JSON-LD',
      status: 'fail',
      score: 0,
      maxScore: 8,
      details: 'No valid Schema.org JSON-LD script blocks found.',
      recommendation: 'Add JSON-LD markup (e.g. WebSite, Organization, SoftwareApplication, Product) to help AI extract structured facts.',
    });
  }

  // Check 4: Metadata & OpenGraph
  const title = $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content')?.trim();
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();

  let metaScore = 0;
  if (title) metaScore += 2;
  if (metaDesc) metaScore += 1;
  if (ogTitle) metaScore += 1;

  if (metaScore >= 4) {
    checks.push({
      id: 'semantic-metadata',
      name: 'Machine-Readable Metadata',
      description: 'Page title, description, and OpenGraph headers for entity context',
      status: 'pass',
      score: 4,
      maxScore: 4,
      details: 'Title, description, and OpenGraph metadata present.',
    });
  } else {
    checks.push({
      id: 'semantic-metadata',
      name: 'Machine-Readable Metadata',
      description: 'Page title, description, and OpenGraph headers for entity context',
      status: 'warn',
      score: metaScore,
      maxScore: 4,
      details: `Incomplete metadata (title: ${Boolean(title)}, desc: ${Boolean(metaDesc)}, og: ${Boolean(ogTitle)})`,
      recommendation: 'Add <title>, <meta name="description">, and <meta property="og:title"> tags.',
    });
  }

  const score = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

  return {
    name: 'Structured Context & Schema',
    score,
    maxScore,
    checks,
  };
}
