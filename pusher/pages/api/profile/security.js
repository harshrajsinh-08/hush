import { User } from '../../../lib/models';
import dbConnect from '../../../lib/db';
import { verifyToken } from '../../../lib/auth';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    await dbConnect();
    const token = verifyToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const { decoyPassword, autoDeleteDuration } = req.body;
        const updates = {};

        if (decoyPassword !== undefined) {
            if (decoyPassword.trim() === '') {
                // Clear it if empty
                updates.decoyPassword = '';
            } else {
                updates.decoyPassword = decoyPassword;
            }
        }

        if (autoDeleteDuration !== undefined) {
            updates.autoDeleteDuration = parseInt(autoDeleteDuration);
        }

        await User.findOneAndUpdate({ username: token.username }, updates);
        res.status(200).json({ success: true, message: 'Security settings updated' });
    } catch (e) {
        res.status(500).json({ message: 'Error updating settings' });
    }
}
