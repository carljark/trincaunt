import express, { Request, Response, NextFunction, Router } from 'express';
import User from '../models/User';
import ApiTokenService, { isApiToken } from '../services/ApiTokenService';
import OAuthService, { OAuthError } from '../services/OAuthService';
import { loadMcpHandler } from '../services/RemoteMcp';

// Conector MCP remoto (/mcp) y su servidor de autorización OAuth, en la raíz del dominio
// (los clientes buscan /.well-known/... ahí). La pantalla de permiso es de la app (/oauth/consent).
const router = Router();

const issuerOf = (req: Request) =>
  process.env.PUBLIC_URL?.replace(/\/+$/, '') ||
  `${(req.get('x-forwarded-proto') ?? req.protocol).split(',')[0].trim()}://${req.get('host')}`;

const oauthError = (res: Response, next: NextFunction, error: unknown) => {
  if (error instanceof OAuthError) {
    res.status(error.status).json({ error: error.error, error_description: error.message });
    return;
  }
  next(error);
};

router.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp', '/.well-known/openid-configuration'],
  (req, res) => { res.json(OAuthService.metadata(issuerOf(req))); });

router.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
  (req, res) => { res.json(OAuthService.resourceMetadata(issuerOf(req))); });

router.post('/oauth/register', async (req, res, next) => {
  try {
    res.status(201).json(await OAuthService.register(req.body ?? {}));
  } catch (error) { oauthError(res, next, error); }
});

// Comprueba la petición y manda a la pantalla de permiso de la app, con los mismos parámetros
router.get('/oauth/authorize', async (req, res, next) => {
  try {
    const { redirectUri, error } = await OAuthService.checkAuthorize(req.query);
    if (error) {
      const url = new URL(redirectUri);
      url.searchParams.set('error', error);
      if (typeof req.query.state === 'string') url.searchParams.set('state', req.query.state);
      res.redirect(302, url.toString());
      return;
    }
    const query = new URLSearchParams(Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === 'string'));
    res.redirect(302, `/oauth/consent?${query}`);
  } catch (error) { next(error); }
});

router.post('/oauth/token', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await OAuthService.token(req.body ?? {}, id => User.findById(id)));
  } catch (error) { oauthError(res, next, error); }
});

// MCP por Streamable HTTP, sin sesión: solo POST, con un token de API (el que da el OAuth)
router.all('/mcp', async (req, res, next) => {
  try {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido' }, id: null });
      return;
    }
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const auth = isApiToken(token) ? await ApiTokenService.authenticate(token) : null;
    if (!auth) {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${issuerOf(req)}/.well-known/oauth-protected-resource/mcp"`)
        .status(401).json({ error: 'invalid_token', error_description: 'Falta el token o no es válido' });
      return;
    }
    const handle = await loadMcpHandler();
    await handle(req, res, req.body, { apiUrl: `http://127.0.0.1:${process.env.PORT || 3000}`, token });
  } catch (error) { next(error); }
});

export default router;
