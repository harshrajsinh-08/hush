import dbConnect from '../../../lib/db';
import { User, Message, Conversation, Invite } from '../../../lib/models';

export default async function handler(req, res) {
  // Security: In a real app, you'd want strictly restricted access here.
  // For this personal app, we'll just check for a secret query param or similar if needed,
  // or just leave it open for dev use since it's a specific "admin" action.
  // For now, let's keep it simple but maybe check method.
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await dbConnect();

  try {
    // 1. Get all valid usernames
    const users = await User.find({}).select('username');
    const validUsernames = new Set(users.map(u => u.username));

    // 2. Cleanup Messages
    // Delete messages where sender OR receiver is NOT in validUsernames
    const messageCleanup = await Message.deleteMany({
      $or: [
        { sender: { $nin: Array.from(validUsernames) } },
        { receiver: { $nin: Array.from(validUsernames) } }
      ]
    });

    // 3. Cleanup Conversations
    // Find conversations where ANY participant is invalid
    // This is a bit trickier with $elemMatch in deleteMany for arrays, 
    // effectively we want to delete if participants contains any value NOT in validUsernames.
    const conversationCleanup = await Conversation.deleteMany({
      participants: { $elemMatch: { $nin: Array.from(validUsernames) } }
    });

    // 4. Cleanup Invites
    const inviteCleanup = await Invite.deleteMany({
      createdBy: { $nin: Array.from(validUsernames) }
    });

    res.status(200).json({
      message: 'Cleanup complete',
      stats: {
        messagesDeleted: messageCleanup.deletedCount,
        conversationsDeleted: conversationCleanup.deletedCount,
        invitesDeleted: inviteCleanup.deletedCount,
        validUsersCount: validUsernames.size
      }
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ message: 'Cleanup failed', error: error.message });
  }
}
