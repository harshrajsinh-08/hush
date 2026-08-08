// scripts/manage-user.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';

// Define User & Invite Schemas locally for standalone Node script execution
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  decoyPassword: { type: String },
  autoDeleteDuration: { type: Number, default: 0 },
  avatar: { type: String, default: '' },
  status: { type: String, default: 'Hey there! I am using Hush.' },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const InviteSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  createdBy: { type: String, required: true },
  isUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Invite = mongoose.models.Invite || mongoose.model('Invite', InviteSchema);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function connectDB() {
  if (process.argv.includes('--local')) {
    MONGODB_URI = 'mongodb://localhost:27017/chat-app';
  }

  console.log('Connecting to MongoDB at:', MONGODB_URI.replace(/:([^@]+)@/, ':****@'));
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB.\n');
  } catch (err) {
    console.error('❌ Primary DB connection failed:', err.message);
    if (!process.argv.includes('--local') && MONGODB_URI !== 'mongodb://localhost:27017/chat-app') {
      console.log('🔄 Attempting fallback connection to local MongoDB (mongodb://localhost:27017/chat-app)...');
      try {
        MONGODB_URI = 'mongodb://localhost:27017/chat-app';
        await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ Connected to local MongoDB.\n');
        return;
      } catch (localErr) {
        console.error('❌ Local MongoDB connection failed:', localErr.message);
      }
    }
    console.error('\nPlease verify your database connection or run with --local to use local MongoDB.');
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.filter(arg => !arg.startsWith('--')).slice(2);
  const command = args[0];

  await connectDB();

  // Non-interactive CLI flags
  if (command === 'list') {
    await listUsers();
    process.exit(0);
  } else if (command === 'add' && args[1] && args[2]) {
    await createUser(args[1], args[2]);
    process.exit(0);
  } else if (command === 'reset' && args[1] && args[2]) {
    await resetPassword(args[1], args[2]);
    process.exit(0);
  } else if (command === 'invite' && args[1]) {
    await createInvite(args[1]);
    process.exit(0);
  }

  // Interactive CLI menu if no args provided
  while (true) {
    console.log('========================================');
    console.log('       HUSH USER MANAGEMENT UTILITY     ');
    console.log('========================================');
    console.log('1. List all existing usernames');
    console.log('2. Add a new user');
    console.log('3. Reset password for an existing user');
    console.log('4. Exit');
    console.log('========================================');

    const choice = await question('Select an option (1-4): ');

    if (choice === '1') {
      await listUsers();
    } else if (choice === '2') {
      const username = await question('Enter new username: ');
      const password = await question('Enter new password: ');
      if (username && password) {
        await createUser(username, password);
      } else {
        console.log('❌ Username and password cannot be empty.');
      }
    } else if (choice === '3') {
      const username = await question('Enter username to reset: ');
      const newPassword = await question('Enter new password: ');
      if (username && newPassword) {
        await resetPassword(username, newPassword);
      } else {
        console.log('❌ Username and password cannot be empty.');
      }
    } else if (choice === '4' || choice.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      process.exit(0);
    } else {
      console.log('Invalid option. Please try again.\n');
    }
  }
}

async function listUsers() {
  const users = await User.find({}, 'username createdAt status').sort({ createdAt: -1 });
  console.log(`\n📋 Found ${users.length} user(s) in database (${MONGODB_URI}):`);
  if (users.length === 0) {
    console.log('  (No users found in database)');
  } else {
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. Username: "${u.username}" | Created: ${u.createdAt ? u.createdAt.toISOString() : 'N/A'}`);
    });
  }
  console.log('');
}

async function createUser(rawUsername, password) {
  const username = rawUsername.trim().toLowerCase();
  const existing = await User.findOne({ username });
  if (existing) {
    console.log(`❌ User "${username}" already exists. Use reset password option instead.\n`);
    return;
  }

  const newUser = new User({ username, password });
  await newUser.save();
  console.log(`✅ User "${username}" successfully created!\n`);
}

async function resetPassword(rawUsername, newPassword) {
  const username = rawUsername.trim().toLowerCase();
  const user = await User.findOne({ username });
  if (!user) {
    console.log(`❌ User "${username}" not found in database.\n`);
    return;
  }

  user.password = newPassword;
  await user.save();
  console.log(`✅ Password for user "${username}" has been successfully updated!\n`);
}

async function createInvite(createdBy) {
  const code = 'INV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const invite = new Invite({ code, createdBy });
  await invite.save();
  console.log(`\n🎟️  New Invite Code Created: ${code}`);
  console.log(`  Use this invite code during web signup.\n`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
