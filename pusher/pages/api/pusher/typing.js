import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { receiver, typing, sender } = req.body;

  try {
    await pusher.trigger(`private-user-${receiver}`, 'typing_status', { sender, typing });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling typing status via Pusher:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
