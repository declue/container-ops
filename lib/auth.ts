// lib/auth.ts
import { randomBytes, createHash } from 'crypto';
import { redis, ensureRedisConnection } from './redis';

const ADMIN_PASSWORD_KEY = 'admin:password';

// Generate a random password
export function generatePassword(): string {
  return randomBytes(16).toString('hex');
}

// Hash password for comparison
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// Get admin password from environment or generate one
export async function getAdminPassword(): Promise<{ password: string; isGenerated: boolean }> {
  const envPassword = process.env.ADMIN_PASSWORD;

  // If environment variable is set, use it
  if (envPassword && envPassword.trim()) {
    return { password: envPassword.trim(), isGenerated: false };
  }

  // Check if we have a stored password in Redis
  try {
    await ensureRedisConnection();
    const storedPassword = await redis.get(ADMIN_PASSWORD_KEY);

    if (storedPassword) {
      return { password: storedPassword, isGenerated: true };
    }

    // Generate new password and store it
    const generated = generatePassword();
    await redis.set(ADMIN_PASSWORD_KEY, generated);

    return { password: generated, isGenerated: true };
  } catch (error) {
    console.error('[Auth] Error accessing Redis, using temporary password:', error);
    // Fallback to temporary password if Redis is unavailable
    const generated = generatePassword();
    console.warn('[Auth] WARNING: Temporary password - will change on restart!');
    return { password: generated, isGenerated: true };
  }
}

// Verify password
export async function verifyPassword(input: string): Promise<boolean> {
  const { password } = await getAdminPassword();
  return hashPassword(input) === hashPassword(password);
}

// Generate session token
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}
