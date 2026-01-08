import dbConnect from '../../lib/db';
import { User, Message, Conversation } from '../../lib/models';
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

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect password' });
        }

        // Delete user
        await User.deleteOne({ _id: user._id });

        // Optionally delete messages sent by user or conversations involving user
        // For privacy, maybe delete all messages sent by this user
        await Message.deleteMany({ sender: username });

        // Also remove them from conversations or delete conversations where they are a participant?
        // Maybe just leave their messages as "Deleted User"?
        // But user requested "Permanently delete your account and all messages"

        // Delete conversations where they are a participant?? Or just leave them?
        // Let's delete direct messages? 
        // Usually "delete all messages" means wipe their trace.
        await Message.deleteMany({ receiver: username }); // Delete messages sent to them too?

        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
}
