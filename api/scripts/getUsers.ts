
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db';
import User from '../src/models/User';

const getUsers = async () => {
  await connectDB();

  try {
    const users = await User.find({}, 'nombre');
    if (users.length === 0) {
      console.log('No users found.');
      return;
    }

    console.log('Available users:');
    users.forEach(user => {
      console.log(`- ${user.nombre}`);
    });

  } catch (error) {
    console.error('Error fetching users:', error);
  } finally {
    mongoose.disconnect();
  }
};

getUsers();
