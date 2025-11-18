import mongoose from 'mongoose';

/**
 * MongoDB connection configuration
 */
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/audit_logs';

/**
 * Connect to MongoDB with retry logic
 */
export async function connectToMongoDB(): Promise<void> {
  const maxRetries = 10;
  const retryDelay = 2000;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      console.log(`[MongoDB] Attempting to connect to ${MONGODB_URL}...`);

      await mongoose.connect(MONGODB_URL, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      console.log('[MongoDB] Successfully connected to MongoDB');

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('[MongoDB] Connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('[MongoDB] Disconnected from MongoDB');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('[MongoDB] Reconnected to MongoDB');
      });

      return;
    } catch (error) {
      currentRetry++;
      console.error(
        `[MongoDB] Connection failed (attempt ${currentRetry}/${maxRetries}):`,
        error instanceof Error ? error.message : error
      );

      if (currentRetry < maxRetries) {
        console.log(`[MongoDB] Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts`);
      }
    }
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectFromMongoDB(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected successfully');
  } catch (error) {
    console.error('[MongoDB] Error during disconnect:', error);
    throw error;
  }
}

/**
 * Check if MongoDB is connected
 */
export function isMongoDBConnected(): boolean {
  return Number(mongoose.connection.readyState) === 1;
}
