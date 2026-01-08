// scripts/migrate-crypto.js
const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

// Define Schemas Locally to avoid ESM import issues with Next.js models
const ConversationSchema = new mongoose.Schema({
  participants: [{ type: String, required: true }],
  password: { type: String, required: true },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  type: { type: String, default: 'text' },
  content: { type: String, required: true },
  caption: { type: String },
  timestamp: { type: Date, default: Date.now },
  v: { type: Number, default: 1 } // 1 for CryptoJS, 2 for AES-GCM
});

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function migrate() {
  if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI not found in .env.local");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB...");

  const conversations = await Conversation.find({});
  console.log(`Found ${conversations.length} conversations.\n`);

  for (const conv of conversations) {
    const chatName = conv.participants.sort().join(' & ');
    console.log(`--- Conversation: ${chatName} ---`);
    
    let password = '';
    let authenticated = false;

    while (!authenticated) {
      password = await question(`Enter password for ${chatName} (or 'skip' to skip): `);
      if (password.toLowerCase() === 'skip') break;

      authenticated = await bcrypt.compare(password, conv.password);
      if (!authenticated) {
        console.log("Invalid password. Try again.");
      }
    }

    if (!authenticated) {
      console.log(`Skipping conversation ${chatName}.\n`);
      continue;
    }

    // Key derivation for V2: SHA-256 of password
    const key = crypto.createHash('sha256').update(password).digest();

    const messages = await Message.find({
      $or: [
        { sender: conv.participants[0], receiver: conv.participants[1] },
        { sender: conv.participants[1], receiver: conv.participants[0] }
      ],
      v: { $ne: 2 } // Only migrate if not already V2
    });

    console.log(`Migrating ${messages.length} messages...`);

    for (const msg of messages) {
      try {
        // 1. Decrypt with CryptoJS (V1)
        let decryptedContent = '';
        if (msg.type === 'otv') {
            decryptedContent = msg.content; // OTV is usually cleartext in DB but limited reveal
        } else {
            const bytes = CryptoJS.AES.decrypt(msg.content, password);
            decryptedContent = bytes.toString(CryptoJS.enc.Utf8);
        }

        if (!decryptedContent || decryptedContent === '[Decryption Failed]') {
            // Try to see if it's actually not encrypted or something else
            continue;
        }

        // 2. Encrypt with AES-GCM (V2)
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(decryptedContent, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');

        msg.content = `v2:${iv.toString('hex')}:${encrypted}:${tag}`;
        msg.v = 2;

        if (msg.caption) {
            const cBytes = CryptoJS.AES.decrypt(msg.caption, password);
            const dCaption = cBytes.toString(CryptoJS.enc.Utf8);
            if (dCaption && dCaption !== '[Decryption Failed]') {
                const cIv = crypto.randomBytes(12);
                const cCipher = crypto.createCipheriv('aes-256-gcm', key, cIv);
                let cEnc = cCipher.update(dCaption, 'utf8', 'hex');
                cEnc += cCipher.final('hex');
                const cTag = cCipher.getAuthTag().toString('hex');
                msg.caption = `v2:${cIv.toString('hex')}:${cEnc}:${cTag}`;
            }
        }

        if (msg.replyToData && msg.replyToData.content) {
            const rBytes = CryptoJS.AES.decrypt(msg.replyToData.content, password);
            const dReply = rBytes.toString(CryptoJS.enc.Utf8);
            if (dReply && dReply !== '[Decryption Failed]') {
                const rIv = crypto.randomBytes(12);
                const rCipher = crypto.createCipheriv('aes-256-gcm', key, rIv);
                let rEnc = rCipher.update(dReply, 'utf8', 'hex');
                rEnc += rCipher.final('hex');
                const rTag = rCipher.getAuthTag().toString('hex');
                msg.replyToData.content = `v2:${rIv.toString('hex')}:${rEnc}:${rTag}`;
                msg.markModified('replyToData');
            }
        }

        await msg.save();
      } catch (err) {
        console.error(`Failed to migrate message ${msg._id}:`, err.message);
      }
    }
    console.log(`Migration completed for ${chatName}.\n`);
  }

  console.log("All done!");
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
