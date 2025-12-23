import { Message, Conversation } from '../../lib/models';
import mongoose from 'mongoose';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { user1, user2, password } = req.query;

  if (!user1 || !user2 || !password) {
    return res.status(400).json({ message: 'user1, user2, and password are required' });
  }

  try {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    const participants = [user1, user2].sort();
    const conversation = await Conversation.findOne({ participants });

    if (!conversation || conversation.password !== password) {
      return res.status(401).json({ message: 'Unauthorized: Invalid or missing password' });
    }

    const { before, limit = 50 } = req.query;
    const query = {
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    };

    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    // Sort back to chronological for the response chunk
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(200).json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
