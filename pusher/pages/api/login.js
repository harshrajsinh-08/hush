import dbConnect from '../../lib/db';
import { User } from '../../lib/models';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  await dbConnect();

  const { username, password, isSignUp } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    // Find user by normalized username
    let user = await User.findOne({ username: normalizedUsername });

    if (isSignUp) {
      // Explicit Create Account mode: ensure username is unique and not already taken
      if (user) {
        return res.status(409).json({ message: 'Username is already taken. Please choose a different username.' });
      }
      // Create new user
      user = await User.create({ username: normalizedUsername, password });
    } else {
      // Log In mode
      if (!user) {
        return res.status(404).json({ message: 'User not found. Please check your username or create an account.' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);

      // Decoy Password Check
      let isDecoy = false;
      if (!isMatch && user.decoyPassword) {
        if (password.trim() === user.decoyPassword) {
          isDecoy = true;
        }
      }

      if (!isMatch && !isDecoy) {
        return res.status(401).json({ message: 'Invalid password' });
      }

      if (isDecoy) {
        // Return a GHOST session (random dummy data)
        return res.status(200).json({
          username: user.username,
          _id: 'ghost-' + Date.now(),
          avatar: '',
          status: 'Offline',
          isGhost: true
        });
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { username: user.username, userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    const cookie = serialize('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });

    res.setHeader('Set-Cookie', cookie);
    res.status(200).json({
      username: user.username,
      _id: user._id,
      avatar: user.avatar,
      status: user.status,
      autoDeleteDuration: user.autoDeleteDuration || 0
    });
  } catch (error) {
    console.error('Login/Signup error:', error);
    // Catch MongoDB duplicate key constraint (E11000)
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Username is already taken. Please choose a different username.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
}
