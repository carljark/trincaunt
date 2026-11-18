import crypto from 'crypto';
import OAuthClient, { IOAuthClient } from '../models/OAuthClient';
import OAuthCode from '../models/OAuthCode';
import { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import ApiTokenService from './ApiTokenService';
import { OAuthError } from './OAuthError';
import { formatScope, parseScope, Scope, SCOPES } from './scopes';

export { OAuthError };

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;
const MAX_NOMBRE = 100;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest();
const hashOf = (value: string) => sha256(value).toString('hex');
const random = () => crypto.randomBytes(32).toString('base64url');

/** Una aplicación que puede pedir acceso: registrada (pública) o fijada por la configuración (confidencial). */
export interface OAuthClientInfo {
  clientId: string;
  nombre: string;
  redirectUris: string[];
  // Solo los clientes confidenciales: el secreto con el que se identifican y los permisos que pueden pedir
  secret?: string;
  scopes?: Scope[];
}

export const CGSSHOPPINGS_CLIENT_ID = 'cgsshoppings';
const CGSSHOPPINGS_SCOPES: Scope[] = ['grupos:leer', 'gastos:crear', 'presupuesto:leer'];

/**
 * Clientes confidenciales: aplicaciones con servidor propio, que guardan un secreto. No se
 * registran por la API: los fija la configuración (su URL y su secreto en el `.env`). Hoy solo
 * cgsshoppings, y solo si están CGSSHOPPINGS_URL y CGSSHOPPINGS_CLIENT_SECRET.
 */
export const configuredClients = (): OAuthClientInfo[] => {
  const url = process.env.CGSSHOPPINGS_URL?.replace(/\/+$/, '');
  const secret = process.env.CGSSHOPPINGS_CLIENT_SECRET;
  if (!url || !secret) return [];
  return [{
    clientId: CGSSHOPPINGS_CLIENT_ID,
    nombre: 'cgsshoppings',
    redirectUris: [`${url}/api/integrations/trincaunt/callback`],
    secret,
    scopes: CGSSHOPPINGS_SCOPES
  }];
};

const findClient = async (clientId: unknown): Promise<OAuthClientInfo | null> => {
  if (typeof clientId !== 'string') return null;
  const configured = configuredClients().find(c => c.clientId === clientId);
  if (configured) return configured;
  const registered: IOAuthClient | null = await OAuthClient.findOne({ clientId });
  return registered && { clientId: registered.clientId, nombre: registered.nombre, redirectUris: registered.redirectUris };
};

const sameSecret = (given: string, expected: string) => crypto.timingSafeEqual(sha256(given), sha256(expected));

/** `client_id` y `client_secret` del cuerpo (client_secret_post) o de la cabecera Basic (client_secret_basic). */
const clientCredentials = (body: Record<string, unknown>, authorization?: string) => {
  if (authorization?.startsWith('Basic ')) {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString();
    const colon = decoded.indexOf(':');
    if (colon > 0) {
      return { clientId: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) };
    }
  }
  return {
    clientId: typeof body.client_id === 'string' ? body.client_id : undefined,
    secret: typeof body.client_secret === 'string' ? body.client_secret : undefined
  };
};

export interface AuthorizeParams {
  response_type?: unknown;
  client_id?: unknown;
  redirect_uri?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  state?: unknown;
  scope?: unknown;
}

// Solo https, salvo en local (clientes de escritorio que escuchan en localhost)
const validRedirect = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    if (url.hash) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
};

const withParams = (base: string, params: Record<string, string | undefined>) => {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
};

/**
 * Servidor de autorización OAuth 2.1 para el conector MCP remoto (/mcp): registro dinámico
 * de clientes públicos, código de autorización con PKCE (S256) y, al canjearlo, un token de
 * API normal del usuario (trc_…), que aparece en Preferencias y se puede borrar allí.
 */
export class OAuthService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  metadata(issuer: string) {
    return {
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`, // en /api/ para que no lo capture el service worker
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      revocation_endpoint: `${issuer}/oauth/revoke`,
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      scopes_supported: ['trincaunt', ...Object.keys(SCOPES)]
    };
  }

  resourceMetadata(issuer: string) {
    return {
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['trincaunt'],
      resource_name: 'Trincaunt'
    };
  }

  async register(body: Record<string, unknown>) {
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every(validRedirect)) {
      throw new OAuthError('invalid_redirect_uri', 'redirect_uris debe ser una lista de URLs https');
    }
    const method = body.token_endpoint_auth_method ?? 'none';
    if (method !== 'none') throw new OAuthError('invalid_client_metadata', 'Solo se admiten clientes públicos (token_endpoint_auth_method none)');
    const nombre = typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim().slice(0, MAX_NOMBRE)
      : 'Asistente';
    const client = await OAuthClient.create({ clientId: random(), nombre, redirectUris: uris });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.nombre,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code']
    };
  }

  /**
   * Comprueba una petición de autorización. Si el cliente o su redirect_uri no son válidos lanza
   * (no se puede volver a una URL no registrada); el resto de errores van de vuelta al cliente.
   * `scopes` son los permisos que tendrá el token (vacío es acceso completo). Un cliente confidencial
   * solo puede pedir los suyos, y si no pide ninguno recibe todos ellos.
   */
  async checkAuthorize(params: AuthorizeParams): Promise<{ client: OAuthClientInfo; redirectUri: string; scopes: Scope[]; error?: string }> {
    const client = await findClient(params.client_id);
    if (!client) throw new AppError('Aplicación desconocida: vuelve a añadir el conector', 400);
    if (typeof params.redirect_uri !== 'string' || !client.redirectUris.includes(params.redirect_uri)) {
      throw new AppError('La dirección de vuelta no es la que registró la aplicación', 400);
    }
    let error: string | undefined;
    let scopes: Scope[] = [];
    if (params.response_type !== 'code') error = 'unsupported_response_type';
    else if (typeof params.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge) || params.code_challenge_method !== 'S256') {
      error = 'invalid_request';
    } else {
      try {
        scopes = parseScope(params.scope);
        if (client.scopes) {
          if (!scopes.length) scopes = client.scopes;
          else if (!scopes.every(scope => client.scopes!.includes(scope))) error = 'invalid_scope';
        }
      } catch (e) {
        if (!(e instanceof OAuthError)) throw e;
        error = e.error;
      }
    }
    return { client, redirectUri: params.redirect_uri, scopes, error };
  }

  /** El usuario acepta o rechaza: devuelve la URL de vuelta al cliente, con el código o el error. */
  async decide(user: { id: unknown }, params: AuthorizeParams, approve: boolean): Promise<string> {
    const { client, redirectUri, scopes, error } = await this.checkAuthorize(params);
    const state = typeof params.state === 'string' ? params.state : undefined;
    if (error) return withParams(redirectUri, { error, state });
    if (!approve) return withParams(redirectUri, { error: 'access_denied', state });

    const code = random();
    await OAuthCode.create({
      hash: hashOf(code),
      clientId: client.clientId,
      usuario: String(user.id),
      redirectUri,
      codeChallenge: params.code_challenge as string,
      scopes,
      expiresAt: new Date(this.now().getTime() + CODE_TTL_MS)
    });
    return withParams(redirectUri, { code, state });
  }

  /**
   * Canjea el código por un token de API del usuario, con los permisos que aceptó. Un cliente
   * confidencial se identifica con su secreto, y su token nuevo sustituye a los que ya tenía ese
   * usuario (reconectar no deja tokens viejos por ahí).
   */
  async token(body: Record<string, unknown>, loadUser: (id: string) => Promise<IUser | null>, authorization?: string) {
    if (body.grant_type !== 'authorization_code') throw new OAuthError('unsupported_grant_type', 'Solo authorization_code');
    if (typeof body.code !== 'string' || typeof body.code_verifier !== 'string') {
      throw new OAuthError('invalid_request', 'Faltan code o code_verifier');
    }
    const credentials = clientCredentials(body, authorization);
    // De un solo uso: se borra al leerlo
    const stored = await OAuthCode.findOneAndDelete({ hash: hashOf(body.code) });
    const invalid = new OAuthError('invalid_grant', 'Código no válido o caducado');
    if (!stored || stored.expiresAt.getTime() < this.now().getTime()) throw invalid;
    if (credentials.clientId !== undefined && credentials.clientId !== stored.clientId) throw invalid;
    if (body.redirect_uri !== undefined && body.redirect_uri !== stored.redirectUri) throw invalid;
    if (sha256(body.code_verifier).toString('base64url') !== stored.codeChallenge) throw invalid;

    const client = await findClient(stored.clientId);
    if (client?.secret && (credentials.secret === undefined || !sameSecret(credentials.secret, client.secret))) {
      throw new OAuthError('invalid_client', 'La aplicación no se ha identificado', 401);
    }
    const user = await loadUser(String(stored.usuario));
    if (!user) throw invalid;
    const scopes = (stored.scopes ?? []) as Scope[];
    if (client?.secret) await ApiTokenService.revokeClientTokens(String(user._id), client.clientId);
    const { token } = await ApiTokenService.create(
      { id: String(user._id), role: user.role },
      `Conector: ${client?.nombre ?? 'asistente'}`.slice(0, 60),
      false,
      { scopes, cliente: client?.clientId }
    );
    return { access_token: token, token_type: 'Bearer', scope: formatScope(scopes) };
  }

  /**
   * Revocación (RFC 7009): un cliente confidencial borra un token que le dieron, p. ej. al
   * desconectarse. Solo los suyos; un token desconocido no es un error.
   */
  async revoke(body: Record<string, unknown>, authorization?: string) {
    const credentials = clientCredentials(body, authorization);
    const client = await findClient(credentials.clientId);
    if (!client?.secret || credentials.secret === undefined || !sameSecret(credentials.secret, client.secret)) {
      throw new OAuthError('invalid_client', 'La aplicación no se ha identificado', 401);
    }
    if (typeof body.token !== 'string') throw new OAuthError('invalid_request', 'Falta token');
    await ApiTokenService.revokeByToken(body.token, client.clientId);
  }
}

export default new OAuthService();
