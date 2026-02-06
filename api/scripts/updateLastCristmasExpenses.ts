
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db';
import Group from '../src/models/Group';
import User from '../src/models/User';
import Expense from '../src/models/Expense';

const updateExpenses = async () => {
  await connectDB();

  try {
    const group = await Group.findOne({ nombre: 'Last Christmas' });
    if (!group) {
      console.log('Group "Last Christmas" not found.');
      return;
    }

    const eva = await User.findOne({ nombre: 'Eva' });
    const jarklos = await User.findOne({ nombre: 'jarklos' });

    if (!eva || !jarklos) {
      console.log('Eva or Jarklos not found.');
      return;
    }

    const participants = [eva._id, jarklos._id];

    const startDate = new Date('2026-02-04T00:00:00.000Z');
    const endDate = new Date('2026-02-04T23:59:59.999Z');

    const expensesToUpdate = await Expense.find({
      grupo_id: group._id,
      fecha: { $gte: startDate, $lte: endDate }
    });

    if (expensesToUpdate.length === 0) {
      console.log('No expenses found for the specified criteria.');
      return;
    }

    for (const expense of expensesToUpdate) {
      expense.participantes = participants;
      await expense.save();
      console.log(`Updated expense: ${expense.descripcion}`);
    }

    console.log('All expenses updated successfully.');
  } catch (error) {
    console.error('Error updating expenses:', error);
  } finally {
    mongoose.disconnect();
  }
};

updateExpenses();
