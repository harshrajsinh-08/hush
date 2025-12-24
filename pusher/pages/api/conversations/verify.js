import { Conversation, Message } from '../../../lib/models';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../../../lib/auth';
import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { user1, user2, password, action } = req.body; // action: 'setup' or 'verify'

  if (!user1 || !user2 || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // 1. Session Authorization (JWT)
  const token = verifyToken(req);
  if (!token) {
      return res.status(401).json({ message: 'Unauthorized: Session required' });
  }

  const normalizedTokenUser = (token.username || '').toLowerCase();
  const u1 = String(user1).toLowerCase();
  const u2 = String(user2).toLowerCase();
  const isParticipant = normalizedTokenUser === u1 || normalizedTokenUser === u2;

  if (!isParticipant) {
      return res.status(403).json({ message: 'Forbidden: You are not a participant' });
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
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      conversation = new Conversation({
        participants,
        password: hashedPassword
      });
      await conversation.save();

      // NEW: Automatically send an OTV message to the recipient with the password
      // NEW: Automatically share password via Secure Inbox (Notification)
      try {
        const { Notification } = await import('../../../lib/models');
        
        const sender = u1; // u1 is user1.toLowerCase()
        const receiver = u2; // u2 is user2.toLowerCase()

        const notification = new Notification({
          sender: user1, 
          recipient: user2, // The other user in the chat
          type: 'password_share',
          content: password
        });

        await notification.save();

        // Trigger Pusher event to receiver's notification channel
        // Using existing user channel but a new event type
        await pusher.trigger(`private-user-${receiver}`, 'new_notification', { 
           count: 1, // Simple signal to refetch or increment
           notification: notification.toObject()
        });
        
        console.log(`Password shared via Inbox from ${sender} to ${receiver}`);
      } catch (notifErr) {
        console.error('Failed to send notification:', notifErr);
      }

      return res.status(200).json({ message: 'Password set successfully', verified: true });
    } else if (action === 'verify') {
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Check if password matches (bcrypt)
      const isMatch = await bcrypt.compare(password, conversation.password);
      
      if (isMatch) {
          return res.status(200).json({ verified: true });
      }
      
      // Fallback: Check plaintext (Legacy support + Lazy Migration)
      if (conversation.password === password) {
          // It matched plaintext, so let's migrate it to hash
          const hashedPassword = await bcrypt.hash(password, 10);
          conversation.password = hashedPassword;
          await conversation.save();
          
          return res.status(200).json({ verified: true, migrated: true });
      }

      return res.status(401).json({ verified: false, message: 'Invalid password' });
    } else {
      res.status(400).json({ message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error handling conversation:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
