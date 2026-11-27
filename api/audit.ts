import { auditTarget } from '../src/core/runner.js';

// ponytail: no rate limit or result cache, add when abuse or cost shows up
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const rfc1918_172 = /^172\.(\d{1,3})\./.exec(h);
  const secondOctet = rfc1918_172 ? Number(rfc1918_172[1]) : -1;
  return (
    h === 'localhost' ||
    h.startsWith('127.') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    (secondOctet >= 16 && secondOctet <= 31) ||
    h.startsWith('169.254.') ||
    h === '0.0.0.0' ||
    h === '[::]' ||
    h === '[::1]' ||
    h.startsWith('[fe80:') ||
    h.startsWith('[fc') ||
    h.startsWith('[fd') ||
    h.startsWith('[::ffff:') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  );
}

export function parseTargetUrl(rawQuery: unknown): { target: URL } | { status: number; error: string } {
  const raw = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  if (!raw || typeof raw !== 'string') {
    return { status: 400, error: 'Missing ?url=https://example.com' };
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let target: URL;
  try {
    target = new URL(withScheme);
  } catch {
    return { status: 400, error: 'Invalid URL' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { status: 400, error: 'Only http and https targets allowed' };
  }
  if (isBlockedHost(target.hostname)) {
    return { status: 400, error: 'Private and local targets blocked' };
  }
  return { target };
}

function parseMinScore(rawQuery: unknown): number {
  const raw = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  if (typeof raw !== 'string') return 80;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 80;
  return Math.max(0, Math.min(100, parsed));
}

export default async function handler(req: any, res: any) {
  const parsed = parseTargetUrl(req.query?.url);
  if ('error' in parsed) {
    res.status(parsed.status).json({ error: parsed.error });
    return;
  }
  const minScore = parseMinScore(req.query?.minScore);
  try {
    const report = await auditTarget(parsed.target.toString(), { minScore });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
}
