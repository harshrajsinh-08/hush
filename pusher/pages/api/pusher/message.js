import { Message, Conversation } from '../../../lib/models';
import mongoose from 'mongoose';
import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
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

    if (!conversation || conversation.password !== password) {
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

    // Trigger Pusher events
    // Send to receiver
    await pusher.trigger(`private-user-${receiver}`, 'receive_message', savedMessage);
    // Send back to sender
    await pusher.trigger(`private-user-${sender}`, 'message_sent', savedMessage);

    res.status(200).json(savedMessage);
  } catch (error) {
    console.error('Error sending message via Pusher:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
