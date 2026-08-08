import dbConnect from '../../lib/db';
import { User } from '../../lib/models';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed. Only POST requests are accepted.' });
  }

  try {
    await dbConnect();
  } catch (dbErr) {
    console.error('Database connection failure:', dbErr);
    return res.status(503).json({ message: 'Database connection failed. Please ensure the database server is running.' });
  }

  const { username, password, isSignUp } = req.body || {};
  const rawUsername = (username || '').trim();
  const rawPassword = password || '';

  if (!rawUsername || !rawPassword) {
    return res.status(400).json({ message: 'Both username and password are required.' });
  }

  const normalizedUsername = rawUsername.toLowerCase();

  if (isSignUp) {
    if (rawUsername.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
    }
    if (/\s/.test(rawUsername)) {
      return res.status(400).json({ message: 'Username cannot contain spaces.' });
    }
    if (rawPassword.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters long.' });
    }
  }

  try {
    // Find user by normalized username
    let user = await User.findOne({ username: normalizedUsername });

    if (isSignUp) {
      // Explicit Create Account mode: ensure username is unique and not already taken
      if (user) {
        return res.status(409).json({ message: `The username "${rawUsername}" is already registered. Please log in or choose a different username.` });
      }
      // Create new user
      user = await User.create({ username: normalizedUsername, password: rawPassword });
    } else {
      // Log In mode
      if (!user) {
        return res.status(404).json({ message: `No account found for "${rawUsername}". Please check the username or switch to Create Account.` });
      }

      // Check password
      const isMatch = await bcrypt.compare(rawPassword, user.password);

      // Decoy Password Check
      let isDecoy = false;
      if (!isMatch && user.decoyPassword) {
        if (rawPassword.trim() === user.decoyPassword) {
          isDecoy = true;
        }
      }

      if (!isMatch && !isDecoy) {
        return res.status(401).json({ message: 'Incorrect password. Please check your password and try again.' });
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
      process.env.JWT_SECRET || 'fallback-secret-for-dev',
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
      return res.status(409).json({ message: `The username "${rawUsername}" is already taken. Please choose a different username.` });
    }
    res.status(500).json({ message: `Server error: ${error.message || 'Internal error'}` });
  }
}
