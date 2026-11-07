import { Request, Response, NextFunction, RequestHandler } from 'express';
import mongoose, { Model } from 'mongoose';
import Group, { IGroup } from '../models/Group';
import Expense from '../models/Expense';
import CategoryAlias from '../models/CategoryAlias';
import { AppError } from '../utils/AppError';
import { hasAdminAccess } from './authMiddleware';

// Control de acceso por grupo: cualquier dato de un grupo (gastos, saldos, pagos,
// notas, alias...) solo lo pueden ver o tocar sus miembros. Estos middlewares van
// detrás de `protect` y dejan el grupo comprobado en res.locals.group.

export const userIdOf = (req: Request) => String((req as any).user?.id ?? (req as any).user?._id);

/** Devuelve el grupo si `userId` es miembro (o si `allowAnyone`, p. ej. un administrador); si no, 400/404/403. */
export const assertGroupMember = async (groupId: unknown, userId: string, allowAnyone = false): Promise<IGroup> => {
  const id = groupId instanceof mongoose.Types.ObjectId ? groupId.toString() : groupId;
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new AppError('Grupo no válido', 400);
  const group = await Group.findById(id);
  if (!group) throw new AppError('Grupo no encontrado', 404);
  if (!allowAnyone && !group.miembros.some(m => m.toString() === userId)) {
    throw new AppError('No perteneces a este grupo', 403);
  }
  return group;
};

const handler = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => { fn(req, res).then(() => next(), next); };

/**
 * Exige ser miembro del grupo indicado en req.params / req.body / req.query.
 * Con `allowAdmin`, un administrador también puede aunque no sea miembro.
 */
export const requireGroupMember = (
  source: 'params' | 'body' | 'query',
  key: string,
  { optional = false, allowAdmin = false } = {}
) =>
  handler(async (req, res) => {
    const value = (req as any)[source]?.[key];
    if (value === undefined || value === '') {
      if (optional) return;
      throw new AppError(`Falta el campo ${key}`, 400);
    }
    res.locals.group = await assertGroupMember(value, userIdOf(req), allowAdmin && hasAdminAccess(req));
  });

/** Carga el documento de :param y exige ser miembro de su grupo (campo `groupField`). */
export const requireMemberOfDoc = (model: Model<any>, param: string, groupField: string, label: string) =>
  handler(async (req, res) => {
    const id = req.params[param];
    if (!mongoose.isValidObjectId(id)) throw new AppError(`${label} no válido`, 400);
    const doc = await model.findById(id).select(groupField).lean<Record<string, unknown>>();
    if (!doc) throw new AppError(`${label} no encontrado`, 404);
    res.locals.group = await assertGroupMember(doc[groupField], userIdOf(req));
  });

/** Edición múltiple: todos los gastos deben ser de grupos tuyos, y también el grupo destino si se mueven. */
export const requireMemberOfExpenses = handler(async (req) => {
  const { expenseIds, updateData } = req.body ?? {};
  if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
    throw new AppError('No se proporcionaron IDs de gastos para actualizar.', 400);
  }
  if (!expenseIds.every(id => mongoose.isValidObjectId(id))) throw new AppError('Algún gasto no es válido', 400);

  const userId = userIdOf(req);
  const groupIds: unknown[] = await Expense.distinct('grupo_id', { _id: { $in: expenseIds } });
  for (const groupId of groupIds) await assertGroupMember(groupId, userId);
  if (updateData?.grupo_id !== undefined) await assertGroupMember(updateData.grupo_id, userId);
});

/**
 * Alias de categoría: los de un grupo, solo sus miembros; los globales (sin grupo)
 * los puede leer cualquiera pero solo los cambia un administrador.
 */
export const requireAliasAccess = (mode: 'create' | 'change') =>
  handler(async (req, res) => {
    const userId = userIdOf(req);
    let groupId: unknown;
    if (mode === 'create') {
      groupId = req.body?.grupo_id;
    } else {
      const { aliasId } = req.params;
      if (!mongoose.isValidObjectId(aliasId)) throw new AppError('Alias no válido', 400);
      const alias = await CategoryAlias.findById(aliasId).select('grupo_id').lean<{ grupo_id?: unknown }>();
      if (!alias) throw new AppError('Alias not found', 404);
      groupId = alias.grupo_id;
    }

    if (groupId === undefined || groupId === null || groupId === '') {
      if (!hasAdminAccess(req)) throw new AppError('Solo un administrador puede cambiar los alias globales', 403);
    } else {
      res.locals.group = await assertGroupMember(groupId, userId);
    }
    // No se puede mover un alias a un grupo ajeno
    if (mode === 'change' && req.body?.grupo_id) await assertGroupMember(req.body.grupo_id, userId);
  });
