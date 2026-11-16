// Mock process.env *before* any imports that might use it
const originalEnv = process.env;
process.env = { ...originalEnv, JWT_SECRET: 'test_secret' };

import { UserService } from '../../src/services/UserService';
import User from '../../src/models/User';
import bcrypt from 'bcrypt';
import { AppError } from '../../src/utils/AppError';

import crypto from 'crypto';
import { sendMail } from '../../src/utils/mailer';

vi.mock('../../src/models/User');
vi.mock('bcrypt');
vi.mock('../../src/utils/mailer');

const UserMock = User as vi.Mocked<typeof User>;
const bcryptMock = bcrypt as vi.Mocked<typeof bcrypt>;

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original env after all tests are done
  });

  beforeEach(() => {
    userService = new UserService();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should create and return a new user', async () => {
      const userData = { nombre: 'Test', email: 'test@example.com', password: 'password123' };
      UserMock.findOne.mockResolvedValue(null);
      bcryptMock.hash.mockImplementation(async () => 'hashedpassword');
      UserMock.create.mockImplementation(async (user: any) => ({ ...user, _id: '1' } as any));

      const result = await userService.register(userData);

      expect(UserMock.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(UserMock.create).toHaveBeenCalledWith({ ...userData, password: 'hashedpassword' });
      expect(result.email).toBe(userData.email);
    });

    it('should throw an error if email is already registered', async () => {
      const userData = { email: 'test@example.com' };
      UserMock.findOne.mockResolvedValue({} as any);

      await expect(userService.register(userData)).rejects.toThrow(
        new AppError('El email ya está registrado', 400)
      );
    });
  });

  describe('findByEmail', () => {
    it('should return a user if found', async () => {
      const user = { email: 'test@example.com' };
      UserMock.findOne.mockResolvedValue(user as any);

      const result = await userService.findByEmail('test@example.com');

      expect(UserMock.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should return null if user not found', async () => {
      UserMock.findOne.mockResolvedValue(null);
      
      const result = await userService.findByEmail('test@example.com');
      
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('only accepts string credentials', async () => {
      await expect(userService.login({ $ne: null }, 'x')).rejects.toMatchObject({ statusCode: 401 });
      await expect(userService.login('a@example.com', { $ne: null })).rejects.toMatchObject({ statusCode: 401 });
      expect(UserMock.findOne).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const withUser = (user: any) => (UserMock.findById as vi.Mock).mockReturnValue({ select: vi.fn().mockResolvedValue(user) });

    it('checks the current password and stores the new one hashed', async () => {
      const user = { password: 'old-hash', save: vi.fn() };
      withUser(user);
      (bcryptMock.compare as vi.Mock).mockResolvedValue(true);
      (bcryptMock.hash as vi.Mock).mockResolvedValue('new-hash');
      await userService.changePassword('u1', 'vieja', 'nueva-segura');
      expect(bcryptMock.compare).toHaveBeenCalledWith('vieja', 'old-hash');
      expect(user.password).toBe('new-hash');
      expect(user.save).toHaveBeenCalled();
    });

    it('refuses a wrong current password or a short new one', async () => {
      withUser({ password: 'old-hash', save: vi.fn() });
      (bcryptMock.compare as vi.Mock).mockResolvedValue(false);
      await expect(userService.changePassword('u1', 'mal', 'nueva-segura')).rejects.toMatchObject({ statusCode: 400 });
      await expect(userService.changePassword('u1', 'vieja', 'corta')).rejects.toMatchObject({ statusCode: 400 });
      await expect(userService.changePassword('u1', '', 'nueva-segura')).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('password reset', () => {
    const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

    it('mails a one-hour link and stores only the hash of its token', async () => {
      UserMock.findOne.mockResolvedValue({ _id: 'u1', nombre: 'Ana', email: 'Ana@Example.com' } as any);
      (UserMock.updateOne as vi.Mock).mockResolvedValue({});
      await userService.requestPasswordReset(' ana@example.com ');

      const query = (UserMock.findOne as vi.Mock).mock.calls[0][0];
      expect(query.email.test('Ana@Example.com')).toBe(true);
      expect(query.email.test('xana@example.com')).toBe(false);
      const [to, , text] = (sendMail as vi.Mock).mock.calls[0];
      expect(to).toBe('Ana@Example.com');
      const token = text.match(/\/reset-password\?token=([0-9a-f]{64})/)[1];
      const [, update] = (UserMock.updateOne as vi.Mock).mock.calls[0];
      expect(update.$set.resetTokenHash).toBe(sha256(token));
      expect(update.$set.resetExpires.getTime() - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    });

    it('does nothing for an unknown email', async () => {
      UserMock.findOne.mockResolvedValue(null);
      await userService.requestPasswordReset('nadie@example.com');
      expect(UserMock.updateOne).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sets the new password and invalidates the token', async () => {
      (UserMock.updateOne as vi.Mock).mockResolvedValue({});
      (bcryptMock.hash as vi.Mock).mockResolvedValue('new-hash');
      UserMock.findOne.mockResolvedValue({ _id: 'u1', email: 'ana@example.com' } as any);
      expect(await userService.resetPassword('abc', 'nueva-segura')).toBe('ana@example.com');

      const query = (UserMock.findOne as vi.Mock).mock.calls[0][0];
      expect(query.resetTokenHash).toBe(sha256('abc'));
      expect(query.resetExpires.$gt).toBeInstanceOf(Date);
      expect(UserMock.updateOne).toHaveBeenCalledWith(
        { _id: 'u1' },
        { $set: { password: 'new-hash' }, $unset: { resetTokenHash: '', resetExpires: '' } }
      );
    });

    it('refuses an invalid or expired token and a short password', async () => {
      UserMock.findOne.mockResolvedValue(null);
      await expect(userService.resetPassword('abc', 'nueva-segura')).rejects.toMatchObject({ statusCode: 400 });
      await expect(userService.resetPassword('', 'nueva-segura')).rejects.toMatchObject({ statusCode: 400 });
      await expect(userService.resetPassword('abc', 'corta')).rejects.toMatchObject({ statusCode: 400 });
      expect(UserMock.updateOne).not.toHaveBeenCalled();
    });
  });
});
