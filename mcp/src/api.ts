// Cliente mínimo de la API REST de Trincaunt, autenticado con un token de API (trc_...)

export class TrincauntApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

export const DEFAULT_URL = 'https://trincaunt.ddns.net';

export const createApiClient = (
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): ApiClient => {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/v1`;

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      throw new TrincauntApiError(`No se pudo conectar con ${baseUrl}: ${(error as Error).message}`, 0);
    }
    if (res.status === 204) return undefined as T;
    const payload = (await res.json().catch(() => ({}))) as { data?: T; message?: string };
    if (!res.ok) {
      const hint = res.status === 401 ? ' Revisa TRINCAUNT_TOKEN: puede que se haya borrado en Preferencias.' : '';
      throw new TrincauntApiError(`${payload.message ?? `Error ${res.status}`}${hint}`, res.status);
    }
    return payload.data as T;
  };

  return {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: path => request('DELETE', path)
  };
};
