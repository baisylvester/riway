import { it, expect, vi } from 'vitest';
import entry from '../../deployment/pages/_worker.js';

it('forwards the original URL, method, body and cookies only through the RIWAY binding', async () => {
  const request = new Request('https://riway-platform.pages.dev/api/market?test=1', {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'riway-market=PH' },
    body: JSON.stringify({ market: 'SG' }),
  });
  const fetch = vi.fn(async (received: Request) => {
    expect(received).toBe(request);
    expect(received.headers.get('cookie')).toBe('riway-market=PH');
    expect(await received.json()).toEqual({ market: 'SG' });
    return new Response('ok', { headers: { 'Set-Cookie': 'riway-market=SG; Secure; HttpOnly; SameSite=Lax' } });
  });
  const response = await entry.fetch(request, { RIWAY_APP: { fetch } });
  expect(fetch).toHaveBeenCalledOnce();
  expect(response.headers.get('Set-Cookie')).toContain('riway-market=SG');
});

it('fails closed if the RIWAY binding is absent', async () => {
  const response = await entry.fetch(new Request('https://riway-platform.pages.dev/'), {});
  expect(response.status).toBe(503);
});

it('staging Pages forwards only to the staging Worker, with the same gateway code', async () => {
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('jsonc-parser');
  // Line endings differ between checkouts; compare the content only.
  const read = (file: string) => readFileSync(file, 'utf8').replace(/
/g, '
');
  const config = (dir: string) => parse(readFileSync(`deployment/${dir}/wrangler.jsonc`, 'utf8'));
  expect(config('pages-staging').name).toBe('riway-platform-staging');
  expect(config('pages-staging').services).toEqual([{ binding: 'RIWAY_APP', service: 'riway-platform-staging' }]);
  expect(config('pages').services).toEqual([{ binding: 'RIWAY_APP', service: 'riway-platform' }]);
  for (const file of ['_worker.js', '_routes.json', '.assetsignore'])
    expect(read(`deployment/pages-staging/${file}`)).toBe(read(`deployment/pages/${file}`));
  const app = parse(readFileSync('wrangler.jsonc', 'utf8'));
  expect(app.env.staging.vars.NEXT_PUBLIC_SITE_URL).toBe('https://riway-platform-staging.pages.dev');
  expect(app.env.staging.workers_dev).toBe(false);
});
