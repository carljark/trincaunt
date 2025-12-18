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
exports.UserService = void 0;
const User_1 = __importDefault(require("../models/User"));
const AppError_1 = require("../utils/AppError");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = 'your-super-secret-key'; // ¡En producción, usa una variable de entorno!
class UserService {
    register(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingUser = yield User_1.default.findOne({ email: data.email });
            if (existingUser) {
                throw new AppError_1.AppError('El email ya está registrado', 400);
            }
            if (data.password) {
                data.password = yield bcrypt_1.default.hash(data.password, 10);
            }
            const user = yield User_1.default.create(data);
            return user;
        });
    }
    login(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield User_1.default.findOne({ email }).select('+password');
            if (!user || !user.password) {
                throw new AppError_1.AppError('Credenciales incorrectas', 401);
            }
            const isMatch = yield bcrypt_1.default.compare(password, user.password);
            if (!isMatch) {
                throw new AppError_1.AppError('Credenciales incorrectas', 401);
            }
            const token = jsonwebtoken_1.default.sign({ id: user._id }, JWT_SECRET, {
                expiresIn: '1d',
            });
            user.password = undefined;
            return { token, user };
        });
    }
    findByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            return User_1.default.findOne({ email });
        });
    }
}
exports.UserService = UserService;
