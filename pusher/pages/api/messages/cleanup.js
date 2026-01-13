import { Message } from '../../../lib/models';
import dbConnect from '../../../lib/db';
import { verifyToken } from '../../../lib/auth';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // Use session or pass in username? verifying token is safer
    const token = verifyToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    await dbConnect();

    try {
        const { durationHours } = req.body;
        if (!durationHours || durationHours <= 0) return res.status(200).json({ deleted: 0 });

        const cutoff = new Date(Date.now() - (durationHours * 60 * 60 * 1000));

        // Delete messages where this user is sender OR receiver and older than cutoff
        const result = await Message.deleteMany({
            $or: [
                { sender: token.username },
                { receiver: token.username }
            ],
            timestamp: { $lt: cutoff }
        });

        res.status(200).json({ deleted: result.deletedCount });
    } catch (e) {
        console.error("Auto delete failed", e);
        res.status(500).json({ message: 'Cleanup failed' });
    }
}
