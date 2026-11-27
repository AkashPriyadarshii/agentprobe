import { auditTarget } from '../src/core/runner.js';
import { parseTargetUrl } from './audit.js';

const BADGE_CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

function getScoreColor(score: number): { name: string; hex: string } {
  if (score >= 90) return { name: 'brightgreen', hex: '#16a34a' };
  if (score >= 80) return { name: 'green', hex: '#2ea043' };
  if (score >= 70) return { name: 'yellow', hex: '#ca8a04' };
  if (score >= 50) return { name: 'orange', hex: '#ea580c' };
  return { name: 'red', hex: '#dc2626' };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderBadgeSvg(label: string, message: string, colorHex: string): string {
  const labelWidth = Math.max(96, Math.round(label.length * 6.5) + 12);
  const valueWidth = Math.max(76, Math.round(message.length * 7.2) + 16);
  const totalWidth = labelWidth + valueWidth;
  const labelX = labelWidth / 2;
  const valueX = labelWidth + valueWidth / 2;
  const safeLabel = escapeXml(label);
  const safeMessage = escapeXml(message);
  const ariaLabel = `${safeLabel}: ${safeMessage}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${ariaLabel}">`,
    `  <title>${ariaLabel}</title>`,
    '  <linearGradient id="s" x2="0" y2="100%">',
    '    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>',
    '    <stop offset="1" stop-opacity=".1"/>',
    '  </linearGradient>',
    '  <clipPath id="r">',
    `    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>`,
    '  </clipPath>',
    '  <g clip-path="url(#r)">',
    `    <rect width="${labelWidth}" height="20" fill="#555"/>`,
    `    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${colorHex}"/>`,
    `    <rect width="${totalWidth}" height="20" fill="url(#s)"/>`,
    '  </g>',
    '  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">',
    `    <text aria-hidden="true" x="${labelX}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>`,
    `    <text x="${labelX}" y="14" fill="#fff">${safeLabel}</text>`,
    `    <text aria-hidden="true" x="${valueX}" y="15" fill="#010101" fill-opacity=".3">${safeMessage}</text>`,
    `    <text x="${valueX}" y="14" fill="#fff">${safeMessage}</text>`,
    '  </g>',
    '</svg>',
  ].join('\n');
}

export default async function handler(req: any, res: any) {
  const parsed = parseTargetUrl(req.query?.url);
  if ('error' in parsed) {
    res.status(parsed.status).json({ error: parsed.error });
    return;
  }

  const formatRaw = Array.isArray(req.query?.format) ? req.query.format[0] : req.query?.format;
  const format = typeof formatRaw === 'string' ? formatRaw.toLowerCase() : '';

  try {
    const report = await auditTarget(parsed.target.toString());
    const score = report.totalScore;
    const message = `${score}/100 (${report.grade})`;
    const color = getScoreColor(score);

    res.setHeader('Cache-Control', BADGE_CACHE_CONTROL);

    if (format === 'json') {
      res.status(200).json({
        schemaVersion: 1,
        label: 'agentreadiness',
        message,
        color: color.name,
      });
      return;
    }

    const svg = renderBadgeSvg('agentreadiness', message, color.hex);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.status(200).send(svg);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
}
