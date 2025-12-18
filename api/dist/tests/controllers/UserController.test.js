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
Object.defineProperty(exports, "__esModule", { value: true });
const UserController_1 = require("../../src/controllers/UserController");
const UserService_1 = require("../../src/services/UserService");
jest.mock('../../src/services/UserService');
const mockRequest = (body) => ({
    body,
});
const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};
const mockNext = () => jest.fn();
describe('UserController', () => {
    describe('register', () => {
        it('should return a new user with status 201', () => __awaiter(void 0, void 0, void 0, function* () {
            const req = mockRequest({
                nombre: 'Test User',
                email: 'test@example.com',
                password: 'password123',
            });
            const res = mockResponse();
            const next = mockNext();
            const user = {
                _id: 'some-id',
                nombre: 'Test User',
                email: 'test@example.com',
            };
            UserService_1.UserService.prototype.register.mockResolvedValue(user);
            yield (0, UserController_1.register)(req, res, next);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                status: 'success',
                data: {
                    user: {
                        id: user._id,
                        nombre: user.nombre,
                        email: user.email,
                    },
                },
            });
        }));
    });
});
