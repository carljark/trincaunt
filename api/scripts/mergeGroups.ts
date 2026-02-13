
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db';
import Group from '../src/models/Group';
import Expense from '../src/models/Expense';

const mergeGroups = async () => {
  await connectDB();

  try {
    const groups = await Group.find({ nombre: { $regex: /mis gastos/i } });
    if (groups.length < 2) {
      console.log('No duplicate groups to merge.');
      return;
    }

    const groupToKeep = groups[0];
    const groupToRemove = groups[1];

    // Update expenses
    const result = await Expense.updateMany(
      { grupo_id: groupToRemove._id },
      { $set: { grupo_id: groupToKeep._id } }
    );

    console.log(`${result.modifiedCount} expenses updated.`);

    // Delete the old group
    await Group.findByIdAndDelete(groupToRemove._id);

    console.log(`Group "${groupToRemove.nombre}" with id ${groupToRemove._id} has been merged and deleted.`);

  } catch (error) {
    console.error('Error merging groups:', error);
  } finally {
    mongoose.disconnect();
  }
};

mergeGroups();
