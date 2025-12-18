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
exports.ExpenseService = void 0;
const Expense_1 = __importDefault(require("../models/Expense"));
const Group_1 = __importDefault(require("../models/Group"));
const AppError_1 = require("../utils/AppError");
class ExpenseService {
    createExpense(data, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const group = yield Group_1.default.findById(data.grupo_id);
            if (!group)
                throw new AppError_1.AppError('Grupo no encontrado', 404);
            const payerId = data.pagado_por ? data.pagado_por.toString() : userId;
            // Regla: Usuario que paga debe ser miembro
            const isPayerMember = group.miembros.some(m => m.toString() === payerId);
            if (!isPayerMember)
                throw new AppError_1.AppError('El usuario que paga no pertenece al grupo', 403);
            // Regla: Monto > 0
            if (data.monto !== undefined && data.monto <= 0)
                throw new AppError_1.AppError('El monto debe ser mayor a 0', 400);
            let participantes;
            if (data.assumeExpense) {
                // El que paga asume el gasto completo, es el único participante.
                participantes = [payerId];
            }
            else if (data.participantes && data.participantes.length > 0) {
                // Se han especificado participantes
                participantes = data.participantes;
            }
            else {
                // Si no se especifican participantes, son todos los del grupo
                participantes = group.miembros;
            }
            const expense = yield Expense_1.default.create(Object.assign(Object.assign({}, data), { pagado_por: payerId, participantes, asume_gasto: data.assumeExpense || false }));
            return expense;
        });
    }
    getExpensesByGroup(groupId) {
        return __awaiter(this, void 0, void 0, function* () {
            return Expense_1.default.find({ grupo_id: groupId })
                .populate('pagado_por', 'nombre')
                .populate('participantes', 'nombre');
        });
    }
    getGroupBalance(groupId) {
        return __awaiter(this, void 0, void 0, function* () {
            const group = yield Group_1.default.findById(groupId).populate('miembros', 'nombre email');
            if (!group) {
                throw new AppError_1.AppError('Grupo no encontrado', 404);
            }
            const expenses = yield Expense_1.default.find({ grupo_id: groupId });
            const balances = {};
            const allUserIds = new Set();
            // Initialize balances for all current members
            for (const member of group.miembros) {
                const memberId = member._id.toString();
                balances[memberId] = 0;
                allUserIds.add(memberId);
            }
            // Collect all users involved in expenses, even if they left the group
            for (const expense of expenses) {
                allUserIds.add(expense.pagado_por.toString());
                expense.participantes.forEach(p => allUserIds.add(p.toString()));
            }
            // Ensure all involved users are in the balance sheet
            allUserIds.forEach(id => {
                var _a;
                (_a = balances[id]) !== null && _a !== void 0 ? _a : (balances[id] = 0);
            });
            // Calculate balances in cents to avoid floating point issues
            for (const expense of expenses) {
                if (expense.asume_gasto) {
                    continue;
                }
                const payerId = expense.pagado_por.toString();
                const amountInCents = Math.round(expense.monto * 100);
                const numParticipants = expense.participantes.length;
                if (numParticipants === 0)
                    continue;
                // Payer gets the full amount added to their balance
                balances[payerId] += amountInCents;
                // Distribute the cost among participants
                const shareInCents = Math.floor(amountInCents / numParticipants);
                let remainder = amountInCents % numParticipants;
                for (const participantId of expense.participantes) {
                    const pid = participantId.toString();
                    let cost = shareInCents;
                    if (remainder > 0) {
                        cost += 1;
                        remainder--;
                    }
                    balances[pid] -= cost;
                }
            }
            const memberDetails = group.miembros.map((member) => ({
                id: member._id,
                nombre: member.nombre,
                email: member.email,
                balance: (balances[member._id.toString()] || 0) / 100, // Convert back to dollars
            }));
            return { balances: memberDetails };
        });
    }
    updateExpense(expenseId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const expense = yield Expense_1.default.findById(expenseId);
            if (!expense) {
                throw new AppError_1.AppError('Gasto no encontrado', 404);
            }
            // Allow updating only certain fields
            if (data.descripcion) {
                expense.descripcion = data.descripcion;
            }
            if (data.monto) {
                if (data.monto <= 0)
                    throw new AppError_1.AppError('El monto debe ser mayor a 0', 400);
                expense.monto = data.monto;
            }
            yield expense.save();
            return expense;
        });
    }
    deleteExpense(expenseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const expense = yield Expense_1.default.findById(expenseId);
            if (!expense) {
                throw new AppError_1.AppError('Gasto no encontrado', 404);
            }
            yield expense.deleteOne();
        });
    }
}
exports.ExpenseService = ExpenseService;
