import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { protect, sessionOnly, requireAdmin, hasAdminAccess, requireScope } from '../../src/middlewares/authMiddleware';
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
    (ApiTokenService.authenticate as vi.Mock).mockResolvedValue({ user, tokenId: 't1', admin: true, scopes: [] });
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

describe('scopes', () => {
  const scoped = { user: { _id: 'u1' }, tokenId: 't1', admin: false, scopes: ['gastos:crear'] };
  // Una petición que llega a una ruta con estos middlewares (como la ve `protect` en req.route)
  const routed = (...handles: unknown[]) => {
    const r = req('Bearer trc_app');
    (r as any).route = { stack: handles.map(handle => ({ handle })) };
    return r;
  };

  beforeEach(() => vi.clearAllMocks());

  it('a scoped token only enters routes that declare a scope', async () => {
    (ApiTokenService.authenticate as vi.Mock).mockResolvedValue(scoped);
    const next = vi.fn();
    await protect(routed(protect, () => undefined), res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, codigo: 'scope_insuficiente' });

    const ok = vi.fn();
    await protect(routed(protect, requireScope('grupos:leer'), () => undefined), res, ok);
    expect(ok).toHaveBeenCalledWith();
  });

  it('a token without scopes goes anywhere, as before', async () => {
    (ApiTokenService.authenticate as vi.Mock).mockResolvedValue({ ...scoped, scopes: [] });
    const next = vi.fn();
    await protect(routed(protect, () => undefined), res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireScope lets through the session, unscoped tokens and the right scope', () => {
    const check = (apiTokenScopes?: string[]) => {
      const next = vi.fn();
      requireScope('gastos:crear')({ apiTokenScopes } as Request, res, next);
      return next.mock.calls[0][0];
    };
    expect(check(undefined)).toBeUndefined();
    expect(check([])).toBeUndefined();
    expect(check(['grupos:leer', 'gastos:crear'])).toBeUndefined();
    expect(check(['grupos:leer'])).toMatchObject({ statusCode: 403, codigo: 'scope_insuficiente' });
  });
});

describe('scopes on a real Express router', () => {
  it('protect sees the route it guards', async () => {
    const app = express();
    const router = express.Router();
    router.get('/abierta', protect, (_req, res) => { res.json({ ok: true }); });
    router.get('/con-permiso', protect, requireScope('grupos:leer'), (_req, res) => { res.json({ ok: true }); });
    app.use(router);
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => { res.status(err.statusCode ?? 500).json({ codigo: err.codigo }); });
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const get = (path: string) => fetch(base + path, { headers: { authorization: 'Bearer trc_app' } }).then(r => r.status);
    try {
      (ApiTokenService.authenticate as vi.Mock).mockResolvedValue({ user: { _id: 'u1' }, tokenId: 't1', admin: false, scopes: ['grupos:leer'] });
      expect(await get('/abierta')).toBe(403);
      expect(await get('/con-permiso')).toBe(200);
      (ApiTokenService.authenticate as vi.Mock).mockResolvedValue({ user: { _id: 'u1' }, tokenId: 't1', admin: false, scopes: [] });
      expect(await get('/abierta')).toBe(200);
    } finally {
      server.close();
    }
  });
});
