import { UserService } from '../../src/services/UserService';
import User from '../../src/models/User';
import bcrypt from 'bcrypt';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/models/User');
jest.mock('bcrypt');

const UserMock = User as jest.Mocked<typeof User>;
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
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
});
