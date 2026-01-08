import dbConnect from '../../lib/db';
import { User } from '../../lib/models';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await dbConnect();
  const { q } = req.query;

  // Session check
  const { verifyToken } = await import('../../lib/auth');
  const token = verifyToken(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const normalizedQ = q?.trim().toLowerCase();
    const query = normalizedQ ? { username: { $regex: normalizedQ, $options: 'i' } } : {};
    const users = await User.find(query).limit(20).select('username avatar status _id');
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}
