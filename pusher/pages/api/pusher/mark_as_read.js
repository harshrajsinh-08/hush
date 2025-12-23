import { Message } from '../../../lib/models';
import mongoose from 'mongoose';
import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { sender, receiver } = req.body;

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    await Message.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );

    await pusher.trigger(`private-user-${sender}`, 'messages_read', { receiver });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling mark as read via Pusher:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
