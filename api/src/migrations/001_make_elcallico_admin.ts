import User from '../models/User';

export async function up() {
  const user = await User.findOneAndUpdate(
    { email: 'elcal.lico@gmail.com' },
    { $set: { role: 'admin', aiEnabled: true } },
    { new: true }
  );

  if (user) {
    console.log(`Usuario ${user.email} promovido a admin.`);
  } else {
    console.log('Usuario elcal.lico@gmail.com no encontrado. Se creará como admin cuando se registre.');
  }
}
