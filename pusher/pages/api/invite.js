import dbConnect from '../../lib/db';
import { Invite } from '../../lib/models';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ message: 'Username required' });
  }

  await dbConnect();

  try {
    // Generate a unique 6-char code
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();

    const invite = await Invite.create({
      code,
      createdBy: username
    });

    res.status(200).json({ code: invite.code });
  } catch (error) {
    console.error('Error generating invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
}
