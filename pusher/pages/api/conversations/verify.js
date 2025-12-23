import { Conversation } from '../../../lib/models';
import mongoose from 'mongoose';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { user1, user2, password, action } = req.body; // action: 'setup' or 'verify'

  if (!user1 || !user2 || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    const participants = [user1, user2].sort();
    let conversation = await Conversation.findOne({ participants });

    if (action === 'setup') {
      if (conversation) {
        return res.status(400).json({ message: 'Conversation already exists' });
      }
      conversation = new Conversation({
        participants,
        password // In a real app, hash this
      });
      await conversation.save();
      return res.status(200).json({ message: 'Password set successfully', verified: true });
    } else if (action === 'verify') {
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      if (conversation.password === password) {
        return res.status(200).json({ verified: true });
      } else {
        return res.status(401).json({ verified: false, message: 'Invalid password' });
      }
    } else {
      res.status(400).json({ message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error handling conversation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
