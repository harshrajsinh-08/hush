import { Message } from '../../../lib/models';
import mongoose from 'mongoose';
import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { messageId, username } = req.body;

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    if (!messageId || !username) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Strict ownership check: Only sender can delete
    if (message.sender !== username) {
      return res.status(403).json({ message: 'Unauthorized: You can only delete your own messages' });
    }

    await Message.findByIdAndDelete(messageId);

    // Trigger Pusher events so it disappears for everyone instantly
    // Notify Receiver
    await pusher.trigger(`private-user-${message.receiver}`, 'message_deleted', { messageId, sender: username });
    
    // Notify Sender (for cross-device sync)
    // Note: The client that initiated the delete will likely update locally optimistically, 
    // but this ensures other tabs/devices of the sender are updated.
    await pusher.trigger(`private-user-${message.sender}`, 'message_deleted', { messageId, sender: username });

    res.status(200).json({ success: true, messageId });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
