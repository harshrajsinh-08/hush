import { Notification } from '../../../lib/models';
import mongoose from 'mongoose';
import { verifyToken } from '../../../lib/auth';
import dbConnect from '../../../lib/db';

export default async function handler(req, res) {
  await dbConnect();

  // 1. Session Check
  const token = verifyToken(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const username = token.username;

  if (req.method === 'GET') {
    try {
      // Fetch unread notifications
      const notifications = await Notification.find({ recipient: username, read: false })
        .sort({ createdAt: -1 });
      res.status(200).json(notifications);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Error fetching notifications' });
    }
  } else if (req.method === 'DELETE') {
    // Delete/Mark as read
    const { id } = req.body;
    try {
        await Notification.findByIdAndDelete(id);
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ message: 'Error deleting notification' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
