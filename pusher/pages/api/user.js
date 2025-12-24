import dbConnect from '../../lib/db';
import { User, Message, Conversation, Invite } from '../../lib/models';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await dbConnect();

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Authorization required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // 1. Delete Messages (Sent & Received to ensure clean break)
    await Message.deleteMany({
        $or: [
            { sender: username },
            { receiver: username }
        ]
    });

    // 2. Delete Invites created by user
    await Invite.deleteMany({ createdBy: username });

    // 3. Update Conversations (Remove user from participants)
    // Pull username from all participants arrays
    await Conversation.updateMany(
        { participants: username },
        { $pull: { participants: username } }
    );

    // 4. Delete empty conversations (optional cleanup)
    await Conversation.deleteMany({ participants: { $size: 0 } });

    // 5. Delete User
    await User.deleteOne({ username });

    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Server error during deletion' });
  }
}
