const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Try to read .env.local for URI
let uri = 'mongodb://localhost:27017/chat-app';
try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
    const match = envFile.match(/MONGODB_URI=(.+)/);
    if (match) {
        uri = match[1].trim();
    }
} catch (e) {
    console.log('Could not read .env.local, using default URI');
}

// Minimal User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', UserSchema);

async function checkUsers() {
  try {
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);
    
    const users = await User.find({});
    console.log('Total users:', users.length);
    users.forEach(u => console.log(`- ${u.username}`));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
