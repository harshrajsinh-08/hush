import dbConnect from '../../../lib/db';
import { User } from '../../../lib/models';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    await dbConnect();

    const { username, avatar, status } = req.body;

    if (!username) {
        return res.status(400).json({ message: 'Username is required' });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (avatar !== undefined) user.avatar = avatar;
        if (status !== undefined) user.status = status;

        await user.save();

        res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                username: user.username,
                avatar: user.avatar,
                status: user.status
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error during profile update' });
    }
}
