import { OAuthError } from './OAuthError';

// Permisos que puede llevar un token de API (documentation/02-conectar-con-oauth.md). Un token sin
// permisos (los de Preferencias y los del conector de Claude) puede hacer todo lo que hace su dueño.
// Uno con permisos solo entra en las rutas que declaran uno de ellos con `requireScope`.
export const SCOPES = {
  'grupos:leer': 'Ver tus grupos, tu email y las categorías que usas',
  'gastos:crear': 'Apuntar gastos en tus grupos',
  'presupuesto:leer': 'Ver tu presupuesto personal',
} as const;

export type Scope = keyof typeof SCOPES;

// Lo que piden los clientes que quieren acceso completo (el conector de Claude)
export const FULL_SCOPE = 'trincaunt';

export const isScope = (value: string): value is Scope => Object.prototype.hasOwnProperty.call(SCOPES, value);

/**
 * Lee el `scope` de OAuth (permisos separados por espacios). Vacío o `trincaunt` es acceso completo
 * (lista vacía); un permiso que no existe es `invalid_scope`.
 */
export const parseScope = (scope: unknown): Scope[] => {
  if (scope === undefined || scope === null || scope === '') return [];
  if (typeof scope !== 'string') throw new OAuthError('invalid_scope', 'scope debe ser un texto');
  const names = [...new Set(scope.split(' ').filter(Boolean))];
  if (names.length === 1 && names[0] === FULL_SCOPE) return [];
  const unknown = names.filter(name => !isScope(name));
  if (unknown.length) throw new OAuthError('invalid_scope', `Permiso desconocido: ${unknown.join(', ')}`);
  return names as Scope[];
};

/** Lo que se devuelve como `scope` en OAuth: los permisos, o `trincaunt` si es acceso completo. */
export const formatScope = (scopes: readonly string[]) => scopes.length ? scopes.join(' ') : FULL_SCOPE;

/** Los permisos en castellano, para la pantalla de permiso y Preferencias. */
export const describeScopes = (scopes: readonly string[]) => scopes.filter(isScope).map(scope => SCOPES[scope]);
