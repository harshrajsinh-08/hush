import mongoose from 'mongoose';

const PRIMARY_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';
const FALLBACK_URI = 'mongodb://localhost:27017/chat-app';

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 4000,
    };

    cached.promise = (async () => {
      try {
        const conn = await mongoose.connect(PRIMARY_URI, opts);
        return conn;
      } catch (err) {
        console.warn(`[dbConnect] Primary DB failed (${err.code || err.message}). Attempting fallback to local MongoDB...`);
        if (PRIMARY_URI !== FALLBACK_URI) {
          try {
            const fallbackConn = await mongoose.connect(FALLBACK_URI, opts);
            console.log('[dbConnect] Successfully connected to local MongoDB fallback.');
            return fallbackConn;
          } catch (fallbackErr) {
            console.error('[dbConnect] Local MongoDB fallback failed:', fallbackErr.message);
            throw fallbackErr;
          }
        }
        throw err;
      }
    })().catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
