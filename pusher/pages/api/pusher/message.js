import { Message, Conversation } from '../../../lib/models';
import mongoose from 'mongoose';
import { pusher } from '../../../lib/pusher';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const { messageId } = req.body;
    try {
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
        }
        await Message.findByIdAndDelete(messageId);
        // Also trigger a pusher event to remove it from other clients? 
        // We already do this via viewOTV locally for the viewer.
        // But strictly speaking, we could broadcast 'message_deleted'.
        // For OTV, silent delete is fine, or broadcast.
        // Let's broadcast to be safe so sender sees it gone too?
        // Actually sender sees it as gone? No, sender sees it in history.
        // Let's just delete it.
        return res.status(200).json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { sender, receiver, content, password, type } = req.body;

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app');
    }

    if (!sender || !receiver || !content || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Verify password
    const participants = [sender, receiver].sort();
    const conversation = await Conversation.findOne({ participants });

    if (!conversation) {
        return res.status(401).json({ message: 'Unauthorized: Conversation not found' });
    }

    // Verify password (bcrypt check)
    let isAuthorized = await bcrypt.compare(password, conversation.password);
    
    // Fallback: Check plaintext (if migration hasn't happened yet for this convo)
    if (!isAuthorized && conversation.password === password) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        return res.status(401).json({ message: 'Unauthorized: Invalid password' });
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
