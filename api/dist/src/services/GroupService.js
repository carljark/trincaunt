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
exports.GroupService = void 0;
const Group_1 = __importDefault(require("../models/Group"));
const User_1 = __importDefault(require("../models/User"));
const AppError_1 = require("../utils/AppError");
class GroupService {
    createGroup(data, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const group = yield Group_1.default.create(Object.assign(Object.assign({}, data), { creado_por: userId, miembros: [userId] // Regla: Creador se añade automáticamente
             }));
            return group;
        });
    }
    addMember(groupId, email) {
        return __awaiter(this, void 0, void 0, function* () {
            const group = yield Group_1.default.findById(groupId);
            if (!group)
                throw new AppError_1.AppError('Grupo no encontrado', 404);
            const userToAdd = yield User_1.default.findOne({ email });
            if (!userToAdd)
                throw new AppError_1.AppError('Usuario no encontrado', 404);
            // Verificar si ya es miembro
            const isMember = group.miembros.some(m => m.toString() === userToAdd.id);
            if (isMember)
                throw new AppError_1.AppError('El usuario ya es miembro del grupo', 400);
            group.miembros.push(userToAdd._id);
            yield group.save();
            return group;
        });
    }
    getGroupsForUser(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return Group_1.default.find({ miembros: userId }).populate('miembros', 'nombre email');
        });
    }
    getGroupById(groupId) {
        return __awaiter(this, void 0, void 0, function* () {
            return Group_1.default.findById(groupId).populate('miembros', 'nombre email');
        });
    }
}
exports.GroupService = GroupService;
