import { auditTarget } from '../src/core/runner.js';

// ponytail: no rate limit or result cache, add when abuse or cost shows up
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h.startsWith('127.') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('172.') ||
    h === '0.0.0.0' ||
    h === '[::]' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  );
}

export default async function handler(req: any, res: any) {
  const raw = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: 'Missing ?url=https://example.com' });
    return;
  }
  let target: URL;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    target = new URL(withScheme);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(400).json({ error: 'Only http and https targets allowed' });
    return;
  }
  if (isBlockedHost(target.hostname)) {
    res.status(400).json({ error: 'Private and local targets blocked' });
    return;
  }
  try {
    const report = await auditTarget(target.toString(), { minScore: 80 });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
}
