import dbConnect from '../../lib/db';
import { User } from '../../lib/models';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await dbConnect();

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    // Find user
    let user = await User.findOne({ username: normalizedUsername });
    
    if (user) {
      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
    } else {
      // Check if Invite Code is valid
      const { inviteCode } = req.body;
      if (!inviteCode) {
        return res.status(403).json({ message: 'Registration requires an invite code' });
      }

      const invite = await import('../../lib/models').then(m => m.Invite.findOne({ code: inviteCode, isUsed: false }));

      if (!invite) {
        return res.status(403).json({ message: 'Invalid or used invite code' });
      }

      // Mark invite as used
      invite.isUsed = true;
      await invite.save();

      // Create new user
      user = await User.create({ username: normalizedUsername, password });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}
