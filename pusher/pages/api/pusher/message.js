import { Message, Conversation } from '../../../lib/models';
import mongoose from 'mongoose';
import { pusher } from '../../../lib/pusher';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const { messageId } = req.body;
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
      }

      // Session check for delete
      const token = verifyToken(req);
      if (!token) return res.status(401).json({ message: 'Unauthorized' });

      const message = await Message.findById(messageId);
      if (!message) return res.status(200).json({ success: true }); // Already gone

      if (message.sender !== token.username) {
        return res.status(403).json({ message: 'Forbidden: Can only delete own messages' });
      }

      await Message.findByIdAndDelete(messageId);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { sender, receiver, content, type } = req.body;

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    if (!sender || !receiver || !content) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // 1. Session Authorization (JWT)
    const token = verifyToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: Session required' });
    }
    if (token.username.toLowerCase() !== sender.toLowerCase()) {
      return res.status(403).json({ message: 'Forbidden: Sender mismatch' });
    }

    // 2. Conversation Existence Verification
    const participants = [sender, receiver].sort();
    const conversation = await Conversation.findOne({ participants });

    if (!conversation) {
      return res.status(403).json({ message: 'Forbidden: Conversation not found' });
    }

    const newMessage = new Message({
      sender,
      receiver,
      type: type || 'text',
      content,
      caption: req.body.caption || undefined,
      timestamp: new Date(),
      replyTo: req.body.replyTo || undefined,
      replyToData: req.body.replyToData || undefined
    });

    const savedMessage = await newMessage.save();

    // Create lightweight payload for Pusher (exclude content for large files)
    const lightPayload = { ...savedMessage.toObject() };
    // Pass tempId back to client for optimistic update matching
    if (req.body.tempId) {
      lightPayload.tempId = req.body.tempId;
    }

    if (type === 'image' || type === 'video') {
      delete lightPayload.content;
    }

    // Trigger Pusher events
    // Send to receiver
    await pusher.trigger(`private-user-${receiver}`, 'receive_message', lightPayload);
    // Send back to sender
    await pusher.trigger(`private-user-${sender}`, 'message_sent', lightPayload);

    res.status(200).json(savedMessage);
  } catch (error) {
    console.error('Error sending message via Pusher:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};
