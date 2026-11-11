import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import oauthRoutes from '../../src/routes/oauth';
import ApiTokenService from '../../src/services/ApiTokenService';
import OAuthService from '../../src/services/OAuthService';
import { loadMcpHandler } from '../../src/services/RemoteMcp';

vi.mock('../../src/services/ApiTokenService', () => ({
  default: { authenticate: vi.fn() },
  isApiToken: (t: string) => t.startsWith('trc_')
}));
vi.mock('../../src/services/RemoteMcp', () => ({ loadMcpHandler: vi.fn() }));
vi.mock('../../src/services/OAuthService', async (original) => {
  const actual: any = await original();
  return { ...actual, default: Object.assign(new actual.OAuthService(), { checkAuthorize: vi.fn(), token: vi.fn() }) };
});

describe('OAuth and remote MCP routes', () => {
  let server: http.Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(oauthRoutes);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server.close());
  beforeEach(() => vi.clearAllMocks());

  it('serves the discovery metadata with the public origin', async () => {
    // Detrás de nginx llega por http, pero hacia fuera es https
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`, { headers: { 'X-Forwarded-Proto': 'https' } });
    const https = base.replace('http:', 'https:');
    expect(await res.json()).toMatchObject({ issuer: https, token_endpoint: `${https}/oauth/token` });
    const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(resource.resource).toBe(`${base}/mcp`);
  });

  it('asks for OAuth when /mcp has no valid token', async () => {
    (ApiTokenService.authenticate as any).mockResolvedValue(null);
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer trc_borrado', 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
    expect(loadMcpHandler).not.toHaveBeenCalled();

    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it('passes an authenticated request to the MCP server with the user token', async () => {
    (ApiTokenService.authenticate as any).mockResolvedValue({ user: {}, tokenId: 't1', admin: false });
    const handle = vi.fn(async (_req, res) => { res.json({ ok: true }); });
    (loadMcpHandler as any).mockResolvedValue(handle);
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer trc_bueno', 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0"}' });
    expect(await res.json()).toEqual({ ok: true });
    expect(handle.mock.calls[0][2]).toEqual({ jsonrpc: '2.0' });
    expect(handle.mock.calls[0][3]).toMatchObject({ token: 'trc_bueno' });
  });

  it('sends a valid authorization request to the consent screen and errors back to the client', async () => {
    (OAuthService.checkAuthorize as any).mockResolvedValueOnce({ redirectUri: 'https://claude.ai/cb' });
    let res = await fetch(`${base}/oauth/authorize?client_id=c1&state=s`, { redirect: 'manual' });
    expect(res.headers.get('location')).toBe('/oauth/consent?client_id=c1&state=s');

    (OAuthService.checkAuthorize as any).mockResolvedValueOnce({ redirectUri: 'https://claude.ai/cb', error: 'invalid_request' });
    res = await fetch(`${base}/oauth/authorize?client_id=c1&state=s`, { redirect: 'manual' });
    expect(res.headers.get('location')).toBe('https://claude.ai/cb?error=invalid_request&state=s');
  });

  it('also answers the authorization request under /api/, which the service worker never intercepts', async () => {
    (OAuthService.checkAuthorize as any).mockResolvedValueOnce({ redirectUri: 'https://claude.ai/cb' });
    const res = await fetch(`${base}/api/oauth/authorize?client_id=c1&state=s`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/oauth/consent?client_id=c1&state=s');
  });

  it('reads the token request as a form', async () => {
    (OAuthService.token as any).mockResolvedValue({ access_token: 'trc_x', token_type: 'Bearer' });
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=abc&code_verifier=v'
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ access_token: 'trc_x', token_type: 'Bearer' });
    expect((OAuthService.token as any).mock.calls[0][0]).toMatchObject({ grant_type: 'authorization_code', code: 'abc' });
  });
});
