import { Message, Conversation } from '../../lib/models';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { user1, user2 } = req.query;

  if (!user1 || !user2) {
    return res.status(400).json({ message: 'user1 and user2 are required' });
  }

  try {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    // 1. Session Authorization (JWT)
    const token = verifyToken(req);
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: Session required' });
    }

    const normalizedTokenUser = token.username.toLowerCase();
    const isParticipant = normalizedTokenUser === user1.toLowerCase() || normalizedTokenUser === user2.toLowerCase();

    if (!isParticipant) {
        return res.status(403).json({ message: 'Forbidden: You are not a participant in this conversation' });
    }

    const participants = [user1, user2].sort();
    const conversation = await Conversation.findOne({ participants });

    if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
    }

    // Note: We allow participants to proceed to fetch the (encrypted) messages.
    // The password is no longer sent or verified over the wire.

    const { before, limit = 50, messageId } = req.query;
    
    if (messageId) {
       const message = await Message.findById(messageId);
       if (!message) return res.status(404).json({ message: 'Message not found' });
       
       // Verify participants of the specific message
       const isMsgParticipant = 
            (message.sender.toLowerCase() === user1.toLowerCase() && message.receiver.toLowerCase() === user2.toLowerCase()) || 
            (message.sender.toLowerCase() === user2.toLowerCase() && message.receiver.toLowerCase() === user1.toLowerCase());

       if (!isMsgParticipant) {
           return res.status(403).json({ message: 'Unauthorized access to message' });
       }
       
       return res.status(200).json(message);
    }

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
