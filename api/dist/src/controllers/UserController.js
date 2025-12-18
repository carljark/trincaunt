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
exports.login = exports.register = void 0;
const UserService_1 = require("../services/UserService");
const userService = new UserService_1.UserService();
const register = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { nombre, email, password } = req.body;
        const user = yield userService.register({ nombre, email, password });
        res.status(201).json({
            status: 'success',
            data: { user: { id: user._id, nombre: user.nombre, email: user.email } }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.register = register;
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        const { token, user } = yield userService.login(email, password);
        res.status(200).json({
            status: 'success',
            token,
            data: { user }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.login = login;
