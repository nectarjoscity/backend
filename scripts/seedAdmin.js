import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin';
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || 'superadmin';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'superadmin@nectarv.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'SuperAdmin123!@#';

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nectarv';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  try {
    let user = await User.findOne({ $or: [{ email: ADMIN_EMAIL }, { username: ADMIN_USERNAME }] });
    if (user) {
      console.log('Admin user already exists. Ensuring role and status...');
      user.role = 'admin';
      user.isActive = true;
      user.name = ADMIN_NAME;
      user.username = ADMIN_USERNAME;
      // Update password only if SEED_FORCE_PASSWORD=true
      if (process.env.SEED_FORCE_PASSWORD === 'true') {
        user.password = ADMIN_PASSWORD; // will be hashed by pre-save hook
      }
      await user.save();
    } else {
      console.log('Creating super admin user...');
      user = new User({
        name: ADMIN_NAME,
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD, // hashed by pre-save hook
        role: 'admin',
        isActive: true,
      });
      await user.save();
    }
    console.log('\n✅ Super Admin created successfully!\n');
    console.log('📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Username: ${ADMIN_USERNAME}`);
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Done.');
  } catch (err) {
    console.error('Failed to seed admin:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();


