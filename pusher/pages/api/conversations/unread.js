import dbConnect from '../../../lib/db';
import { Message, User } from '../../../lib/models';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await dbConnect();
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }

  // Session check
  const { verifyToken } = await import('../../../lib/auth');
  const token = verifyToken(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  if (token.username.toLowerCase() !== username.toLowerCase()) {
    return res.status(403).json({ message: 'Forbidden: Access denied' });
  }

  try {
    // Get unread counts grouped by sender
    const unreadCounts = await Message.aggregate([
      { $match: { receiver: username, read: false } },
      { $group: { _id: '$sender', count: { $sum: 1 } } }
    ]);

    const result = unreadCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // Get recent contacts (last 20 people you chatted with)
    const recentContacts = await Message.aggregate([
      { $match: { $or: [{ sender: username }, { receiver: username }] } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: { $cond: { if: { $eq: ['$sender', username] }, then: '$receiver', else: '$sender' } },
          lastTimestamp: { $first: '$timestamp' }
        }
      },
      { $sort: { lastTimestamp: -1 } },
      { $limit: 20 }
    ]);

    // Filter out deleted users and select profile fields
    const contactUsernames = recentContacts.map(c => c._id);
    const existingUsers = await User.find({ username: { $in: contactUsernames } }).select('username avatar status');
    const existingUsersMap = existingUsers.reduce((acc, u) => {
      acc[u.username] = u;
      return acc;
    }, {});

    const validContacts = recentContacts.filter(c => existingUsersMap[c._id]);

    // Format contacts list
    const contacts = validContacts.map(c => ({
      username: c._id,
      avatar: existingUsersMap[c._id].avatar,
      status: existingUsersMap[c._id].status,
      unreadCount: result[c._id] || 0,
      lastTimestamp: c.lastTimestamp
    }));

    res.status(200).json({
      unreadCounts: result,
      contacts: contacts,
      totalUnread: unreadCounts.reduce((sum, curr) => sum + curr.count, 0)
    });
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    res.status(500).json({ message: 'Server error' });
  }
}
