import { connectDB } from './src/config/db';
import User from './src/models/User';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

const resetPassword = async () => {
  await connectDB();
  const email = 'elcal.lico@gmail.com';
  const newPassword = 'password123';
  
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await User.findOneAndUpdate({ email }, { password: hashedPassword });
    if (user) {
      console.log(`Password for ${email} reset to: ${newPassword}`);
    } else {
      console.log(`User with email ${email} not found.`);
    }
  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    mongoose.disconnect();
  }
};

resetPassword();
