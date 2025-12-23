import { Message } from '../../../lib/models';
import mongoose from 'mongoose';
import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { messageId, emoji, username, receiver } = req.body;

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    const message = await Message.findById(messageId);
    if (message) {
      const existingReaction = message.reactions.find(r => r.username === username);
      message.reactions = message.reactions.filter(r => r.username !== username);
      
      if (!existingReaction || existingReaction.type !== emoji) {
        message.reactions.push({ type: emoji, username: username });
      }
      
      await message.save();
      
      // Notify participants
      await pusher.trigger(`private-user-${receiver}`, 'message_reacted', { messageId, reactions: message.reactions });
      await pusher.trigger(`private-user-${username}`, 'message_reacted', { messageId, reactions: message.reactions });
      
      res.status(200).json({ success: true, reactions: message.reactions });
    } else {
      res.status(404).json({ message: 'Message not found' });
    }
  } catch (error) {
    console.error('Error handling reaction via Pusher:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
