import mongoose from 'mongoose';
import Expense from '../src/models/Expense';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trincaunt';

const getCategories = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB Connected...');

        const expenses = await Expense.find({ categoria: { $exists: true, $ne: [] } });
        const categories = new Set<string>();

        for (const expense of expenses) {
            if (Array.isArray(expense.categoria)) {
                for (const category of expense.categoria) {
                    categories.add(category);
                }
            } else if (typeof expense.categoria === 'string') {
                categories.add(expense.categoria);
            }
        }

        console.log('Found categories:');
        console.log(Array.from(categories).join(', '));

    } catch (err) {
        console.error((err as Error).message);
    } finally {
        mongoose.disconnect();
    }
};

getCategories();
