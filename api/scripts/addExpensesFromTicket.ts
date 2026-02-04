
import mongoose from 'mongoose';
import Expense from '../src/models/Expense';
import User from '../src/models/User';
import Group from '../src/models/Group';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trincaunt';

const expensesData = [
    { description: 'ECO LECHE SEMI 1 L', amount: 7.50, categories: ['Supermercado', 'Comida'] },
    { description: 'AGUA MINERAL 8L', amount: 10.20, categories: ['Supermercado', 'Agua'] },
    { description: 'BARRA PAN', amount: 0.90, categories: ['Supermercado', 'Pan'] },
    { description: 'CAFE MOLIDO ESPRESSO 2', amount: 3.59, categories: ['Supermercado'] },
    { description: 'LONGANIZA DE CERDO', amount: 3.15, categories: ['Supermercado', 'Comida'] },
    { description: 'TOMATE TRITURADO 800G', amount: 1.84, categories: ['Supermercado', 'Comida'] },
    { description: 'MAIZ DULCE', amount: 0.99, categories: ['Supermercado', 'Comida'] },
    { description: 'DDS PATATAS 5 KG', amount: 3.95, categories: ['Supermercado', 'Comida'] },
    { description: 'BOLSA BASURA PERFUMADA', amount: 1.49, categories: ['Supermercado'] },
    { description: 'MINITAQUITOS JAMÓN CUR', amount: 2.55, categories: ['Supermercado', 'Comida'] },
    { description: 'L V ECO HIERBABUEN FRE', amount: 1.19, categories: ['Supermercado', 'Comida'] },
    { description: 'BROTES DE ESPINACA', amount: 1.39, categories: ['Supermercado', 'Comida'] },
    { description: 'PUERROS', amount: 1.79, categories: ['Supermercado', 'Comida'] },
    { description: 'COLIFLOR GRANEL', amount: 2.32, categories: ['Supermercado', 'Comida'] },
    { description: 'CALDO DE COCIDO, 1L', amount: 0.99, categories: ['Supermercado', 'Comida'] },
    { description: 'CALDO DE POLLO', amount: 0.69, categories: ['Supermercado', 'Comida'] },
    { description: 'CALDO DE VERDURAS 1 L', amount: 0.92, categories: ['Supermercado', 'Comida'] },
    { description: 'CHORIZO Y SALCHICHÓN', amount: 3.70, categories: ['Supermercado', 'Comida'] },
    { description: 'MAXI YORK', amount: 1.99, categories: ['Supermercado', 'Comida'] },
    { description: 'ZANAHORIA 500 GR', amount: 0.79, categories: ['Supermercado', 'Comida'] },
    { description: 'GARBANZOS COCI EXT 400', amount: 2.48, categories: ['Supermercado', 'Comida'] },
    { description: 'LENTEJAS COCIDAS', amount: 2.55, categories: ['Supermercado', 'Comida'] },
    { description: 'MUSLITOS POLLO FAMILIA', amount: 3.00, categories: ['Supermercado', 'Comida'] },
    { description: 'MUSLITOS POLLO FAMILIA', amount: 2.56, categories: ['Supermercado', 'Comida'] },
    { description: 'ALUBIAS COCIDAS', amount: 1.38, categories: ['Supermercado', 'Comida'] },
    { description: 'GUISANTES MEDIANOS 120', amount: 1.75, categories: ['Supermercado', 'Comida'] },
];

const addExpenses = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB Connected...');

        const user = await User.findOne({ nombre: 'Eva' });
        if (!user) {
            console.error('User "Eva" not found');
            return;
        }

        const group = await Group.findOne({ nombre: 'Last Christmas' });
        if (!group) {
            console.error('Group "Last Christmas" not found');
            return;
        }

        for (const expenseData of expensesData) {
            const expense = new Expense({
                descripcion: expenseData.description,
                monto: expenseData.amount,
                pagado_por: user._id,
                grupo_id: group._id,
                categoria: expenseData.categories,
                fecha: new Date(),
            });
            await expense.save();
            console.log(`Added expense: "${expense.descripcion}"`);
        }

    } catch (err) {
        console.error((err as Error).message);
    } finally {
        mongoose.disconnect();
    }
};

addExpenses();
