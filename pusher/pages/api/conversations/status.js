import { Conversation } from '../../../lib/models';
import mongoose from 'mongoose';

export default async function handler(req, res) {
  const { user1, user2 } = req.query;

  if (!user1 || !user2) {
    return res.status(400).json({ message: 'user1 and user2 are required' });
  }

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    // Session check
    const { verifyToken } = await import('../../../lib/auth');
    const token = verifyToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const normalizedUser = token.username.toLowerCase();
    if (normalizedUser !== user1.toLowerCase() && normalizedUser !== user2.toLowerCase()) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const participants = [user1, user2].sort();
    const conversation = await Conversation.findOne({ participants });

    if (!conversation) {
      return res.status(200).json({ exists: false });
    }

    res.status(200).json({ exists: true });
  } catch (error) {
    console.error('Error checking conversation status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
