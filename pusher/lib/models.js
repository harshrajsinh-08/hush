import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  decoyPassword: { type: String }, // Panic password
  autoDeleteDuration: { type: Number, default: 0 }, // Hours (0 = disabled)
  avatar: { type: String, default: '' },
  status: { type: String, default: 'Hey there! I am using Hush.' },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'otv', 'video'], default: 'text' },
  content: { type: String, required: true },
  caption: { type: String }, // Encrypted caption for images
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  reactions: [{
    type: { type: String },
    username: { type: String }
  }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  replyToData: {
    sender: { type: String },
    content: { type: String },
    type: { type: String }
  }
});

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: String, required: true }],
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});


const InviteSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  createdBy: { type: String, required: true },
  isUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  recipient: { type: String, required: true },
  sender: { type: String, required: true },
  type: { type: String, enum: ['password_share'], default: 'password_share' },
  content: { type: String, required: true }, // The password
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours
});

// Check if models exist to prevent overwrite error in hot reload
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
const Invite = mongoose.models.Invite || mongoose.model('Invite', InviteSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

export { User, Message, Conversation, Invite, Notification };
