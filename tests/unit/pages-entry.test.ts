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
