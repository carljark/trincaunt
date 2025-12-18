"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const UserService_1 = require("../../src/services/UserService");
const User_1 = __importDefault(require("../../src/models/User"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const AppError_1 = require("../../src/utils/AppError");
jest.mock('../../src/models/User');
jest.mock('bcrypt');
const UserMock = User_1.default;
const bcryptMock = bcrypt_1.default;
describe('UserService', () => {
    let userService;
    beforeEach(() => {
        userService = new UserService_1.UserService();
        jest.clearAllMocks();
    });
    describe('register', () => {
        it('should create and return a new user', () => __awaiter(void 0, void 0, void 0, function* () {
            const userData = { nombre: 'Test', email: 'test@example.com', password: 'password123' };
            UserMock.findOne.mockResolvedValue(null);
            bcryptMock.hash.mockImplementation(() => __awaiter(void 0, void 0, void 0, function* () { return 'hashedpassword'; }));
            UserMock.create.mockImplementation((user) => __awaiter(void 0, void 0, void 0, function* () { return (Object.assign(Object.assign({}, user), { _id: '1' })); }));
            const result = yield userService.register(userData);
            expect(UserMock.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
            expect(bcrypt_1.default.hash).toHaveBeenCalledWith('password123', 10);
            expect(UserMock.create).toHaveBeenCalledWith(Object.assign(Object.assign({}, userData), { password: 'hashedpassword' }));
            expect(result.email).toBe(userData.email);
        }));
        it('should throw an error if email is already registered', () => __awaiter(void 0, void 0, void 0, function* () {
            const userData = { email: 'test@example.com' };
            UserMock.findOne.mockResolvedValue({});
            yield expect(userService.register(userData)).rejects.toThrow(new AppError_1.AppError('El email ya está registrado', 400));
        }));
    });
    describe('findByEmail', () => {
        it('should return a user if found', () => __awaiter(void 0, void 0, void 0, function* () {
            const user = { email: 'test@example.com' };
            UserMock.findOne.mockResolvedValue(user);
            const result = yield userService.findByEmail('test@example.com');
            expect(UserMock.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
            expect(result).toEqual(user);
        }));
        it('should return null if user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            UserMock.findOne.mockResolvedValue(null);
            const result = yield userService.findByEmail('test@example.com');
            expect(result).toBeNull();
        }));
    });
});
