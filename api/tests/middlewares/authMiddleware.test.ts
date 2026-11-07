import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { protect, sessionOnly, requireAdmin, hasAdminAccess } from '../../src/middlewares/authMiddleware';
import ApiTokenService from '../../src/services/ApiTokenService';
import User from '../../src/models/User';

vi.mock('../../src/models/User');
vi.mock('../../src/services/ApiTokenService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/ApiTokenService')>();
  return { ...actual, default: { authenticate: vi.fn() } };
});

const req = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as Request;
const res = {} as Response;

describe('protect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('accepts the app session (JWT) as before', async () => {
    const user = { _id: 'u1' };
    (User.findById as vi.Mock).mockResolvedValue(user);
    const r = req(`Bearer ${jwt.sign({ id: 'u1' }, 'test-secret')}`);
    const next = vi.fn();
    await protect(r, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(r.user).toBe(user);
    expect(r.apiTokenId).toBeUndefined();
  });

  it('accepts an API token and marks the request', async () => {
    const user = { _id: 'u1' };
    (ApiTokenService.authenticate as vi.Mock).mockResolvedValue({ user, tokenId: 't1', admin: true });
    const r = req('Bearer trc_secret');
    const next = vi.fn();
    await protect(r, res, next);
    expect(ApiTokenService.authenticate).toHaveBeenCalledWith('trc_secret');
    expect(next).toHaveBeenCalledWith();
    expect(r.user).toBe(user);
    expect(r.apiTokenId).toBe('t1');
    expect(r.apiTokenAdmin).toBe(true);
  });

  it('rejects a revoked API token', async () => {
    (ApiTokenService.authenticate as vi.Mock).mockResolvedValue(null);
    const next = vi.fn();
    await protect(req('Bearer trc_gone'), res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});

describe('sessionOnly', () => {
  it('blocks requests made with an API token', () => {
    const next = vi.fn();
    sessionOnly({ apiTokenId: 't1' } as Request, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });

    const next2 = vi.fn();
    sessionOnly({} as Request, res, next2);
    expect(next2).toHaveBeenCalledWith();
  });
});

describe('requireAdmin', () => {
  const call = (r: Partial<Request>) => {
    const next = vi.fn();
    requireAdmin(r as Request, res, next);
    return next.mock.calls[0][0];
  };
  const admin = { role: 'admin' } as any;

  it('lets an administrator in with the app session or an administration token', () => {
    expect(call({ user: admin })).toBeUndefined();
    expect(call({ user: admin, apiTokenId: 't1', apiTokenAdmin: true })).toBeUndefined();
    expect(hasAdminAccess({ user: admin, apiTokenId: 't1', apiTokenAdmin: true } as Request)).toBe(true);
  });

  it('refuses normal users and administrators using a token without that permission', () => {
    expect(call({ user: { role: 'user' } as any })).toMatchObject({ statusCode: 403 });
    expect(call({ user: { role: 'user' } as any, apiTokenId: 't1', apiTokenAdmin: true })).toMatchObject({ statusCode: 403 });
    const error = call({ user: admin, apiTokenId: 't1', apiTokenAdmin: false });
    expect(error).toMatchObject({ statusCode: 403 });
    expect(error.message).toMatch(/Permite administración/);
    expect(hasAdminAccess({ user: admin, apiTokenId: 't1' } as Request)).toBe(false);
  });
});
