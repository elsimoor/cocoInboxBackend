import { connectToDatabase } from '../db';
import User from '../models/User';

async function makeAdmin() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('Usage: ts-node src/scripts/makeAdmin.ts <email>');
    process.exit(1);
  }

  try {
    await connectToDatabase();
    const user = await User.findOne({ email });
    
    if (!user) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    if (!user.roles.includes('admin')) {
      user.roles.push('admin');
      await user.save();
      console.log(`Successfully added admin role to ${email}`);
      console.log(`Current roles:`, user.roles);
    } else {
      console.log(`User ${email} already has admin role`);
      console.log(`Current roles:`, user.roles);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

makeAdmin();
