import crypto from 'crypto';
import mongoose from 'mongoose';
import { ApiTokenService, MAX_TOKENS_POR_USUARIO } from '../../src/services/ApiTokenService';
import ApiToken from '../../src/models/ApiToken';
import User from '../../src/models/User';

vi.mock('../../src/models/ApiToken');
vi.mock('../../src/models/User');

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const userId = new mongoose.Types.ObjectId().toString();
const user = { id: userId, role: 'user' as const };
const admin = { id: userId, role: 'admin' as const };

describe('ApiTokenService', () => {
  const service = new ApiTokenService();

  beforeEach(() => {
    vi.clearAllMocks();
    (ApiToken.countDocuments as vi.Mock).mockResolvedValue(0);
    (ApiToken.create as vi.Mock).mockImplementation(async (doc: any) => ({ _id: 't1', createdAt: new Date('2026-11-06'), ...doc }));
    (ApiToken.updateOne as vi.Mock).mockResolvedValue({});
  });

  it('creates a token that is shown once and stores only its hash', async () => {
    const { token, apiToken } = await service.create(user, '  MCP portátil ');
    expect(token).toMatch(/^trc_[A-Za-z0-9_-]{43}$/);
    const stored = (ApiToken.create as vi.Mock).mock.calls[0][0];
    expect(stored).toEqual({ usuario: userId, nombre: 'MCP portátil', hash: sha(token), prefijo: token.slice(0, 10), admin: false });
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(apiToken).toEqual({ _id: 't1', nombre: 'MCP portátil', prefijo: token.slice(0, 10), admin: false, ultimoUso: null, createdAt: new Date('2026-11-06') });
  });

  it('validates the name and the limit', async () => {
    await expect(service.create(user, '')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.create(user, 'x'.repeat(61))).rejects.toMatchObject({ statusCode: 400 });
    (ApiToken.countDocuments as vi.Mock).mockResolvedValue(MAX_TOKENS_POR_USUARIO);
    await expect(service.create(user, 'otro')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('only lets administrators create administration tokens', async () => {
    await expect(service.create(user, 'admin', true)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.create(admin, 'admin', 'yes')).rejects.toMatchObject({ statusCode: 400 });
    const { apiToken } = await service.create(admin, 'admin', true);
    expect(apiToken.admin).toBe(true);
    expect((ApiToken.create as vi.Mock).mock.calls[0][0].admin).toBe(true);
  });

  it('authenticates by hash and records the last use at most hourly', async () => {
    const owner = { _id: userId };
    (User.findById as vi.Mock).mockResolvedValue(owner);
    const now = new Date('2026-11-06T10:00:00Z');

    (ApiToken.findOne as vi.Mock).mockResolvedValue({ _id: 't1', usuario: userId, ultimoUso: new Date('2026-11-06T09:30:00Z') });
    await expect(service.authenticate('trc_abc', now)).resolves.toEqual({ user: owner, tokenId: 't1', admin: false });
    expect(ApiToken.findOne).toHaveBeenCalledWith({ hash: sha('trc_abc') });
    expect(ApiToken.updateOne).not.toHaveBeenCalled();

    (ApiToken.findOne as vi.Mock).mockResolvedValue({ _id: 't1', usuario: userId, ultimoUso: new Date('2026-11-06T08:00:00Z') });
    await service.authenticate('trc_abc', now);
    expect(ApiToken.updateOne).toHaveBeenCalledWith({ _id: 't1' }, { $set: { ultimoUso: now } });

    (ApiToken.findOne as vi.Mock).mockResolvedValue({ _id: 't2', usuario: userId, admin: true, ultimoUso: now });
    await expect(service.authenticate('trc_adm', now)).resolves.toEqual({ user: owner, tokenId: 't2', admin: true });
  });

  it('rejects unknown tokens and tokens of deleted users', async () => {
    (ApiToken.findOne as vi.Mock).mockResolvedValue(null);
    await expect(service.authenticate('trc_x')).resolves.toBeNull();
    (ApiToken.findOne as vi.Mock).mockResolvedValue({ _id: 't1', usuario: userId });
    (User.findById as vi.Mock).mockResolvedValue(null);
    await expect(service.authenticate('trc_x')).resolves.toBeNull();
  });

  it('revokes only your own tokens', async () => {
    (ApiToken.deleteOne as vi.Mock).mockResolvedValue({ deletedCount: 1 });
    const id = new mongoose.Types.ObjectId().toString();
    await service.revoke(userId, id);
    expect(ApiToken.deleteOne).toHaveBeenCalledWith({ _id: id, usuario: userId });

    (ApiToken.deleteOne as vi.Mock).mockResolvedValue({ deletedCount: 0 });
    await expect(service.revoke(userId, id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.revoke(userId, 'nope')).rejects.toMatchObject({ statusCode: 400 });
  });
});
