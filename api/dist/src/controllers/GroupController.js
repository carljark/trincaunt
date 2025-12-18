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
exports.getGroupById = exports.getMyGroups = exports.addMember = exports.createGroup = void 0;
const GroupService_1 = require("../services/GroupService");
const groupService = new GroupService_1.GroupService();
const createGroup = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const group = yield groupService.createGroup(req.body, userId);
        res.status(201).json({ status: 'success', data: group });
    }
    catch (error) {
        next(error);
    }
});
exports.createGroup = createGroup;
const addMember = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { groupId } = req.params;
        const { email } = req.body;
        const group = yield groupService.addMember(groupId, email);
        res.status(200).json({ status: 'success', data: group });
    }
    catch (error) {
        next(error);
    }
});
exports.addMember = addMember;
const getMyGroups = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const groups = yield groupService.getGroupsForUser(userId);
        res.status(200).json({ status: 'success', data: groups });
    }
    catch (error) {
        next(error);
    }
});
exports.getMyGroups = getMyGroups;
const getGroupById = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { groupId } = req.params;
        const group = yield groupService.getGroupById(groupId);
        if (!group) {
            return res.status(404).json({ status: 'fail', message: 'Grupo no encontrado' });
        }
        res.status(200).json({ status: 'success', data: group });
    }
    catch (error) {
        next(error);
    }
});
exports.getGroupById = getGroupById;
