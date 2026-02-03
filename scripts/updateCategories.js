const mongoose = require('mongoose');
// We need to register the models first
require('../api/dist/models/Group');
require('../api/dist/models/User');
const Expense = require('../api/dist/models/Expense').default;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trincaunt';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const stopWords = new Set(['de', 'la', 'el', 'y', 'a', 'en', 'un', 'una', 'con', 'por', 'para', 'mi', 'su', 'al', 'del']);

const getKeywords = (text) => {
    if (!text) return [];
    return text.toLowerCase().split(/\s+/)
        .map(word => word.replace(/[^\w\s]/gi, ''))
        .filter(word => word.length > 2 && !stopWords.has(word));
};

const updateCategories = async () => {
    await connectDB();

    const categorizedExpenses = await Expense.find({ categoria: { $exists: true, $ne: [] } });
    const uncategorizedExpenses = await Expense.find({ $or: [{ categoria: { $exists: false } }, { categoria: [] }] });

    console.log(`Found ${categorizedExpenses.length} categorized expenses.`);
    console.log(`Found ${uncategorizedExpenses.length} uncategorized expenses.`);

    const keywordCategoryMap = new Map();

    for (const expense of categorizedExpenses) {
        const keywords = getKeywords(expense.descripcion);
        for (const keyword of keywords) {
            if (!keywordCategoryMap.has(keyword)) {
                keywordCategoryMap.set(keyword, new Map());
            }
            const categoryMap = keywordCategoryMap.get(keyword);
            for (const category of expense.categoria) {
                categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
            }
        }
    }

    for (const expense of uncategorizedExpenses) {
        const keywords = getKeywords(expense.descripcion);
        const categoryScores = new Map();

        for (const keyword of keywords) {
            if (keywordCategoryMap.has(keyword)) {
                const categoryMap = keywordCategoryMap.get(keyword);
                for (const [category, score] of categoryMap.entries()) {
                    categoryScores.set(category, (categoryScores.get(category) || 0) + score);
                }
            }
        }

        if (categoryScores.size > 0) {
            const bestCategory = [...categoryScores.entries()].sort((a, b) => b[1] - a[1])[0][0];
            expense.categoria = [bestCategory];
            await expense.save();
            console.log(`Updated expense "${expense.descripcion}" with category "${bestCategory}"`);
        } else {
            console.log(`Could not find a category for expense "${expense.descripcion}"`);
        }
    }

    console.log('Category update process finished.');
    mongoose.disconnect();
};

updateCategories();
