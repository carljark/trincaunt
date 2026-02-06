import mongoose from 'mongoose';
import { connectDB } from '../src/config/db';
import Group from '../src/models/Group';

const getGroups = async () => {
  await connectDB();

  try {
    const groups = await Group.find({}, 'nombre');
    if (groups.length === 0) {
      console.log('No groups found.');
      return;
    }

    console.log('Available groups:');
    groups.forEach(group => {
      console.log(`- ${group.nombre}`);
    });

  } catch (error) {
    console.error('Error fetching groups:', error);
  } finally {
    mongoose.disconnect();
  }
};

getGroups();