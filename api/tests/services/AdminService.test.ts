import mongoose from 'mongoose';
import { AdminService, generatePassword } from '../../src/services/AdminService';
import User from '../../src/models/User';

vi.mock('../../src/models/User');
vi.mock('../../src/models/Group');

const oid = () => new mongoose.Types.ObjectId().toString();

const userDoc = (over: Record<string, unknown> = {}) => ({
  _id: oid(),
  nombre: 'Ana',
  email: 'ana@example.com',
  role: 'user',
  aiEnabled: false,
  fecha_registro: new Date('2026-01-01'),
  password: 'hash',
  save: vi.fn().mockResolvedValue(undefined),
  ...over
});

describe('AdminService', () => {
  const register = vi.fn();
  const service = new AdminService({ register } as any);

  beforeEach(() => vi.clearAllMocks());

  it('creates a user with a generated password that is returned once', async () => {
    register.mockImplementation(async (data: any) => userDoc({ nombre: data.nombre, email: data.email }));
    const { user, password } = await service.createUser('  Ana ', ' ana@example.com ');
    expect(password).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(register).toHaveBeenCalledWith({ nombre: 'Ana', email: 'ana@example.com', password });
    expect(user).toMatchObject({ nombre: 'Ana', email: 'ana@example.com', role: 'user' });
    expect(user).not.toHaveProperty('password');
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it('validates name and email', async () => {
    await expect(service.createUser('A', 'a@b.co')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.createUser('Ana', 'no-es-email')).rejects.toMatchObject({ statusCode: 400 });
    expect(register).not.toHaveBeenCalled();
  });

  it('changes the role of other users but never your own', async () => {
    const target = userDoc();
    (User.findById as vi.Mock).mockResolvedValue(target);
    const me = oid();
    await expect(service.setRole(me, target._id, 'admin')).resolves.toMatchObject({ role: 'admin' });
    expect(target.save).toHaveBeenCalled();
    await expect(service.setRole(me, me, 'user')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.setRole(me, target._id, 'root')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.setRole(me, 'nope', 'user')).rejects.toMatchObject({ statusCode: 400 });
    (User.findById as vi.Mock).mockResolvedValue(null);
    await expect(service.setRole(me, oid(), 'user')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('turns the AI on and off', async () => {
    const target = userDoc();
    (User.findById as vi.Mock).mockResolvedValue(target);
    await expect(service.setAI(target._id, true)).resolves.toMatchObject({ aiEnabled: true });
    await expect(service.setAI(target._id, 'sí')).rejects.toMatchObject({ statusCode: 400 });
  });
});
