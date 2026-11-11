import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { OAuthService } from '../../src/services/OAuthService';
import OAuthClient from '../../src/models/OAuthClient';
import OAuthCode from '../../src/models/OAuthCode';
import ApiTokenService from '../../src/services/ApiTokenService';

vi.mock('../../src/models/OAuthClient', () => ({ default: { create: vi.fn(), findOne: vi.fn() } }));
vi.mock('../../src/models/OAuthCode', () => ({ default: { create: vi.fn(), findOneAndDelete: vi.fn() } }));
vi.mock('../../src/services/ApiTokenService', () => ({ default: { create: vi.fn() } }));

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const verifier = 'v'.repeat(50);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const user = { _id: 'u1', id: 'u1', role: 'user' };
const client = { clientId: 'c1', nombre: 'Claude', redirectUris: [REDIRECT], createdAt: new Date('2026-11-09T10:00:00Z') };
const params = {
  response_type: 'code', client_id: 'c1', redirect_uri: REDIRECT,
  code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz'
};

describe('OAuthService', () => {
  let service: OAuthService;
  let codes: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OAuthService(() => new Date('2026-11-09T10:00:00Z'));
    codes = [];
    (OAuthClient.findOne as any).mockImplementation(async ({ clientId }: any) => (clientId === 'c1' ? client : null));
    (OAuthClient.create as any).mockImplementation(async (data: any) => ({ ...data, createdAt: new Date('2026-11-09T10:00:00Z') }));
    (OAuthCode.create as any).mockImplementation(async (data: any) => { codes.push(data); return data; });
    (OAuthCode.findOneAndDelete as any).mockImplementation(async ({ hash }: any) => {
      const i = codes.findIndex(c => c.hash === hash);
      return i === -1 ? null : codes.splice(i, 1)[0];
    });
    (ApiTokenService.create as any).mockResolvedValue({ token: 'trc_nuevo' });
  });

  it('publishes the metadata clients look for', () => {
    expect(service.metadata('https://t.example')).toMatchObject({
      issuer: 'https://t.example',
      authorization_endpoint: 'https://t.example/api/oauth/authorize',
      token_endpoint: 'https://t.example/oauth/token',
      registration_endpoint: 'https://t.example/oauth/register',
      code_challenge_methods_supported: ['S256']
    });
    expect(service.resourceMetadata('https://t.example')).toMatchObject({
      resource: 'https://t.example/mcp', authorization_servers: ['https://t.example']
    });
  });

  it('registers public clients with https redirect URIs only', async () => {
    const registered = await service.register({ client_name: 'Claude', redirect_uris: [REDIRECT, 'http://localhost:6274/cb'] });
    expect(registered).toMatchObject({ client_name: 'Claude', token_endpoint_auth_method: 'none', redirect_uris: [REDIRECT, 'http://localhost:6274/cb'] });
    expect(registered.client_id).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    await expect(service.register({ redirect_uris: ['http://evil.example/cb'] })).rejects.toMatchObject({ error: 'invalid_redirect_uri' });
    await expect(service.register({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' }))
      .rejects.toMatchObject({ error: 'invalid_client_metadata' });
  });

  it('never sends the user to a redirect URI the client did not register', async () => {
    await expect(service.checkAuthorize({ ...params, client_id: 'otro' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.checkAuthorize({ ...params, redirect_uri: 'https://evil.example/cb' })).rejects.toMatchObject({ statusCode: 400 });
    expect((await service.checkAuthorize({ ...params, code_challenge_method: 'plain' })).error).toBe('invalid_request');
  });

  it('gives a one-time code with PKCE that becomes an API token of the user', async () => {
    const redirect = new URL(await service.decide(user, params, true));
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(redirect.searchParams.get('state')).toBe('xyz');
    const code = redirect.searchParams.get('code')!;

    const body = { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: 'c1', redirect_uri: REDIRECT };
    expect(await service.token(body, async () => user as any)).toEqual({ access_token: 'trc_nuevo', token_type: 'Bearer', scope: 'trincaunt' });
    expect(ApiTokenService.create).toHaveBeenCalledWith({ id: 'u1', role: 'user' }, 'Conector: Claude');

    await expect(service.token(body, async () => user as any)).rejects.toMatchObject({ error: 'invalid_grant' });
  });

  it('rejects a wrong verifier, an expired code and a denied request', async () => {
    let code = new URL(await service.decide(user, params, true)).searchParams.get('code')!;
    await expect(service.token({ grant_type: 'authorization_code', code, code_verifier: 'w'.repeat(50) }, async () => user as any))
      .rejects.toMatchObject({ error: 'invalid_grant' });

    code = new URL(await service.decide(user, params, true)).searchParams.get('code')!;
    const later = new OAuthService(() => new Date('2026-11-09T10:11:00Z'));
    await expect(later.token({ grant_type: 'authorization_code', code, code_verifier: verifier }, async () => user as any))
      .rejects.toMatchObject({ error: 'invalid_grant' });

    const denied = new URL(await service.decide(user, params, false));
    expect(denied.searchParams.get('error')).toBe('access_denied');
    expect(denied.searchParams.get('code')).toBeNull();

    await expect(service.token({ grant_type: 'password' }, async () => user as any)).rejects.toMatchObject({ error: 'unsupported_grant_type' });
  });
});
