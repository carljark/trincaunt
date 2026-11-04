import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  assertGroupMember,
  requireGroupMember,
  requireMemberOfDoc,
  requireMemberOfExpenses,
  requireAliasAccess
} from '../../src/middlewares/groupAccess';
import Group from '../../src/models/Group';
import Expense from '../../src/models/Expense';
import CategoryAlias from '../../src/models/CategoryAlias';

vi.mock('../../src/models/Group');
vi.mock('../../src/models/Expense');
vi.mock('../../src/models/CategoryAlias');

const oid = () => new mongoose.Types.ObjectId().toString();
const me = oid();
const stranger = oid();
const myGroup = oid();
const otherGroup = oid();

const groups: Record<string, { _id: string; miembros: { toString: () => string }[] }> = {
  [myGroup]: { _id: myGroup, miembros: [{ toString: () => me }] },
  [otherGroup]: { _id: otherGroup, miembros: [{ toString: () => stranger }] }
};

const lean = <T>(value: T) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

// Ejecuta un middleware y devuelve el error que pasa a next (o undefined)
const run = async (mw: any, req: Partial<Request>, res: any = { locals: {} }) => {
  let error: any;
  await new Promise<void>(resolve => mw({ params: {}, body: {}, query: {}, user: { id: me }, ...req } as Request, res as Response, (err?: unknown) => {
    error = err;
    resolve();
  }));
  return { error, res };
};

describe('groupAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Group.findById as vi.Mock).mockImplementation(async (id: string) => groups[id] ?? null);
  });

  describe('assertGroupMember', () => {
    it('returns the group for a member', async () => {
      await expect(assertGroupMember(myGroup, me)).resolves.toBe(groups[myGroup]);
      await expect(assertGroupMember(new mongoose.Types.ObjectId(myGroup), me)).resolves.toBe(groups[myGroup]);
    });

    it('answers 403 / 404 / 400', async () => {
      await expect(assertGroupMember(otherGroup, me)).rejects.toMatchObject({ statusCode: 403 });
      await expect(assertGroupMember(oid(), me)).rejects.toMatchObject({ statusCode: 404 });
      await expect(assertGroupMember('global', me)).rejects.toMatchObject({ statusCode: 400 });
      await expect(assertGroupMember({ $ne: null }, me)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('requireGroupMember', () => {
    it('lets members through and keeps the group', async () => {
      const { error, res } = await run(requireGroupMember('params', 'groupId'), { params: { groupId: myGroup } as any });
      expect(error).toBeUndefined();
      expect(res.locals.group).toBe(groups[myGroup]);
    });

    it('blocks other groups, from params, body or query', async () => {
      expect((await run(requireGroupMember('params', 'groupId'), { params: { groupId: otherGroup } as any })).error.statusCode).toBe(403);
      expect((await run(requireGroupMember('body', 'grupo_id'), { body: { grupo_id: otherGroup } })).error.statusCode).toBe(403);
      expect((await run(requireGroupMember('query', 'groupId'), { query: { groupId: otherGroup } as any })).error.statusCode).toBe(403);
    });

    it('requires the field unless optional', async () => {
      expect((await run(requireGroupMember('body', 'grupo_id'), {})).error.statusCode).toBe(400);
      const { error, res } = await run(requireGroupMember('query', 'groupId', { optional: true }), {});
      expect(error).toBeUndefined();
      expect(res.locals.group).toBeUndefined();
    });
  });

  describe('requireMemberOfDoc', () => {
    const mw = requireMemberOfDoc(Expense as any, 'expenseId', 'grupo_id', 'Gasto');

    it('checks the group of the document', async () => {
      (Expense.findById as vi.Mock).mockReturnValue(lean({ grupo_id: new mongoose.Types.ObjectId(myGroup) }));
      expect((await run(mw, { params: { expenseId: oid() } as any })).error).toBeUndefined();

      (Expense.findById as vi.Mock).mockReturnValue(lean({ grupo_id: new mongoose.Types.ObjectId(otherGroup) }));
      expect((await run(mw, { params: { expenseId: oid() } as any })).error.statusCode).toBe(403);
    });

    it('answers 404 for a missing document and 400 for a bad id', async () => {
      (Expense.findById as vi.Mock).mockReturnValue(lean(null));
      expect((await run(mw, { params: { expenseId: oid() } as any })).error.statusCode).toBe(404);
      expect((await run(mw, { params: { expenseId: 'x' } as any })).error.statusCode).toBe(400);
    });
  });

  describe('requireMemberOfExpenses', () => {
    it('requires every expense to be in my groups', async () => {
      (Expense.distinct as vi.Mock).mockResolvedValue([new mongoose.Types.ObjectId(myGroup)]);
      expect((await run(requireMemberOfExpenses, { body: { expenseIds: [oid()], updateData: { categoria: ['X'] } } })).error).toBeUndefined();

      (Expense.distinct as vi.Mock).mockResolvedValue([new mongoose.Types.ObjectId(myGroup), new mongoose.Types.ObjectId(otherGroup)]);
      expect((await run(requireMemberOfExpenses, { body: { expenseIds: [oid(), oid()], updateData: {} } })).error.statusCode).toBe(403);
    });

    it('does not allow moving expenses into someone else\'s group', async () => {
      (Expense.distinct as vi.Mock).mockResolvedValue([new mongoose.Types.ObjectId(myGroup)]);
      const { error } = await run(requireMemberOfExpenses, { body: { expenseIds: [oid()], updateData: { grupo_id: otherGroup } } });
      expect(error.statusCode).toBe(403);
    });

    it('validates the ids', async () => {
      expect((await run(requireMemberOfExpenses, { body: { expenseIds: [] } })).error.statusCode).toBe(400);
      expect((await run(requireMemberOfExpenses, { body: { expenseIds: ['nope'] } })).error.statusCode).toBe(400);
    });
  });

  describe('requireAliasAccess', () => {
    it('lets members create aliases for their group only', async () => {
      expect((await run(requireAliasAccess('create'), { body: { grupo_id: myGroup } })).error).toBeUndefined();
      expect((await run(requireAliasAccess('create'), { body: { grupo_id: otherGroup } })).error.statusCode).toBe(403);
    });

    it('keeps global aliases for admins', async () => {
      expect((await run(requireAliasAccess('create'), { body: {} })).error.statusCode).toBe(403);
      expect((await run(requireAliasAccess('create'), { body: {}, user: { id: me, role: 'admin' } as any })).error).toBeUndefined();
    });

    it('checks the group of an existing alias and of the new one', async () => {
      (CategoryAlias.findById as vi.Mock).mockReturnValue(lean({ grupo_id: new mongoose.Types.ObjectId(otherGroup) }));
      expect((await run(requireAliasAccess('change'), { params: { aliasId: oid() } as any })).error.statusCode).toBe(403);

      (CategoryAlias.findById as vi.Mock).mockReturnValue(lean({ grupo_id: new mongoose.Types.ObjectId(myGroup) }));
      expect((await run(requireAliasAccess('change'), { params: { aliasId: oid() } as any })).error).toBeUndefined();
      expect((await run(requireAliasAccess('change'), { params: { aliasId: oid() } as any, body: { grupo_id: otherGroup } })).error.statusCode).toBe(403);
    });
  });
});
