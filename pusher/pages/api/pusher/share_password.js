import { Conversation, Notification } from '../../../lib/models';
import dbConnect from '../../../lib/db';
import { verifyToken } from '../../../lib/auth';
import { pusher } from '../../../lib/pusher';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { sender, receiver, password } = req.body;

  if (!sender || !receiver || !password) {
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

  try {
    await dbConnect();

    // 2. Conversation Password Verification
    const participants = [sender, receiver].sort();
    const conversation = await Conversation.findOne({ participants });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Verify password (bcrypt check)
    // We expect the sender to provide the correct password for the conversation they are in
    let isAuthorized = await bcrypt.compare(password, conversation.password);
    
    // Fallback: Check plaintext (if migration hasn't happened yet for this convo)
    if (!isAuthorized && conversation.password === password) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        return res.status(401).json({ message: 'Unauthorized: Invalid password' });
    }

    // 3. Create and save notification
    const notification = new Notification({
      sender: sender, 
      recipient: receiver,
      type: 'password_share',
      content: password
    });

    await notification.save();

    // 4. Trigger Pusher notification event to receiver
    await pusher.trigger(`private-user-${receiver.toLowerCase()}`, 'new_notification', { 
       count: 1,
       notification: notification.toObject()
    });

    res.status(200).json({ success: true, message: 'Password shared via Inbox' });
  } catch (error) {
    console.error('Error sharing password via notification:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
