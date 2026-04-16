
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CategoryAlias from '../src/models/CategoryAlias';
import Expense from '../src/models/Expense';
import { connectDB } from '../src/config/db';

dotenv.config();

const migrate = async () => {
  await connectDB();
  console.log('Starting migration...');

  try {
    // 1. Get all existing global aliases
    const globalAliases = await CategoryAlias.find({ grupo_id: { $exists: false } });
    const globalAliasMap = new Map(globalAliases.map(a => [a.alias, a.mainCategories]));
    console.log(`Found ${globalAliases.length} global aliases.`);

    // 2. Find all unique (group, category) pairs from Expenses
    const groupCategoryPairs = await Expense.aggregate([
      { $unwind: "$categoria" },
      { $group: { _id: { grupo_id: "$grupo_id", categoria: "$categoria" } } }
    ]);
    console.log(`Found ${groupCategoryPairs.length} unique group-category pairs from expenses.`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const pair of groupCategoryPairs) {
      let { grupo_id, categoria } = pair._id;

      // Ensure categoria is a string, handle nested arrays if any
      while (Array.isArray(categoria)) {
        categoria = categoria[0];
      }

      if (typeof categoria !== 'string' || !categoria) {
        skippedCount++;
        continue;
      }

      // Check if this alias already exists for this group
      const existing = await CategoryAlias.findOne({ alias: categoria, grupo_id });
      if (existing) {
        skippedCount++;
        continue;
      }

      // Use mainCategories from global alias if available, otherwise use category itself
      const mainCategories = globalAliasMap.get(categoria) || [categoria];

      await CategoryAlias.create({
        alias: categoria,
        mainCategories,
        grupo_id
      });
      createdCount++;
    }

    console.log(`Migration completed: ${createdCount} created, ${skippedCount} skipped.`);
    
    // Optional: Keep global aliases for now as templates, or delete them
    // const deleteResult = await CategoryAlias.deleteMany({ grupo_id: { $exists: false } });
    // console.log(`Deleted ${deleteResult.deletedCount} global aliases.`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

migrate();
