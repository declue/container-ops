// lib/redis.ts
import { Redis } from "ioredis";

const getRedisUrl = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  // During build time, return a placeholder URL
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    console.warn("[Redis] REDIS_URL not set, using placeholder for build");
    return "redis://localhost:6379";
  }
  throw new Error("REDIS_URL environment variable is not set");
};

const redisUrl = getRedisUrl();

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true, // Don't connect immediately during build
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err);
});

redis.on("connect", () => {
  console.log("[Redis] Connected successfully");
});

// Helper function to safely ensure connection
export async function ensureRedisConnection(): Promise<void> {
  if (redis.status === 'ready') {
    return; // Already connected
  }

  if (redis.status === 'connecting') {
    // Wait for connection to complete
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', () => resolve());
      redis.once('error', (err) => reject(err));
    });
    return;
  }

  // Not connected, connect now
  await redis.connect();
}

export default redis;
