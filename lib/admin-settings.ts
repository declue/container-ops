// lib/admin-settings.ts
import { redis, ensureRedisConnection } from './redis';

const SETTINGS_KEY = 'admin:settings';
const SESSIONS_KEY = 'admin:sessions';

export interface VisibilitySettings {
  showProcessList: boolean;
  showCpuChart: boolean;
  showMemoryChart: boolean;
  showStorageChart: boolean;
  showTopProcesses: boolean;
  showDebugInfo: boolean;
}

export interface CollectionSettings {
  intervalSeconds: number; // Cron interval in seconds
  memoryReadMode: 'auto' | 'cgroup' | 'procfs'; // How to read memory usage
}

export interface LogFileConfig {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
}

export interface LogSettings {
  files: LogFileConfig[];
  maxLines: number; // Maximum number of log lines to keep per file
}

export interface ThresholdSettings {
  cpu: number; // CPU usage percentage threshold
  memory: number; // Memory usage percentage threshold
  storage: number; // Storage usage percentage threshold
  enabled: boolean; // Enable/disable threshold alerts
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: 'POST' | 'GET' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body: string; // JSON string template
  enabled: boolean;
}

export interface WebhookSettings {
  configs: WebhookConfig[];
}

export interface AdminSettings {
  visibility: VisibilitySettings;
  collection: CollectionSettings;
  logs: LogSettings;
  thresholds: ThresholdSettings;
  webhooks: WebhookSettings;
}

const DEFAULT_SETTINGS: AdminSettings = {
  visibility: {
    showProcessList: true,
    showCpuChart: true,
    showMemoryChart: true,
    showStorageChart: true,
    showTopProcesses: true,
    showDebugInfo: true,
  },
  collection: {
    intervalSeconds: 5,
    memoryReadMode: 'auto',
  },
  logs: {
    files: [],
    maxLines: 500,
  },
  thresholds: {
    cpu: 80,
    memory: 80,
    storage: 80,
    enabled: false,
  },
  webhooks: {
    configs: [],
  },
};

// Get admin settings
export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    await ensureRedisConnection();
    const data = await redis.get(SETTINGS_KEY);
    if (!data) {
      return DEFAULT_SETTINGS;
    }
    return JSON.parse(data) as AdminSettings;
  } catch (error) {
    console.error('[Admin Settings] Error getting settings:', error);
    return DEFAULT_SETTINGS;
  }
}

// Save admin settings
export async function saveAdminSettings(settings: AdminSettings): Promise<void> {
  try {
    await ensureRedisConnection();
    await redis.set(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[Admin Settings] Error saving settings:', error);
    throw error;
  }
}

// Session management
export async function createSession(token: string): Promise<void> {
  try {
    await ensureRedisConnection();
    await redis.setex(`${SESSIONS_KEY}:${token}`, 86400, '1'); // 24 hours
  } catch (error) {
    console.error('[Admin Settings] Error creating session:', error);
    throw error;
  }
}

export async function validateSession(token: string): Promise<boolean> {
  try {
    await ensureRedisConnection();
    const exists = await redis.exists(`${SESSIONS_KEY}:${token}`);
    return exists === 1;
  } catch (error) {
    console.error('[Admin Settings] Error validating session:', error);
    return false;
  }
}

export async function deleteSession(token: string): Promise<void> {
  try {
    await ensureRedisConnection();
    await redis.del(`${SESSIONS_KEY}:${token}`);
  } catch (error) {
    console.error('[Admin Settings] Error deleting session:', error);
  }
}

// Get metrics data size
export async function getMetricsInfo(): Promise<{
  count: number;
  estimatedSize: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}> {
  try {
    await ensureRedisConnection();
    const keys = await redis.keys('metrics:*');

    if (keys.length === 0) {
      return {
        count: 0,
        estimatedSize: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0,
      };
    }

    // Sample a few keys to estimate size
    const sampleSize = Math.min(10, keys.length);
    const samples = keys.slice(0, sampleSize);
    let totalSampleSize = 0;

    for (const key of samples) {
      const value = await redis.get(key);
      if (value) {
        totalSampleSize += Buffer.byteLength(value, 'utf8');
      }
    }

    const avgSize = totalSampleSize / sampleSize;
    const estimatedSize = Math.round(avgSize * keys.length);

    // Get timestamps
    const timestamps = keys
      .map(k => parseInt(k.split(':')[1]))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    return {
      count: keys.length,
      estimatedSize,
      oldestTimestamp: timestamps[0] || 0,
      newestTimestamp: timestamps[timestamps.length - 1] || 0,
    };
  } catch (error) {
    console.error('[Admin Settings] Error getting metrics info:', error);
    return {
      count: 0,
      estimatedSize: 0,
      oldestTimestamp: 0,
      newestTimestamp: 0,
    };
  }
}

// Clear all metrics data
export async function clearMetricsCache(): Promise<number> {
  try {
    await ensureRedisConnection();
    const keys = await redis.keys('metrics:*');
    if (keys.length === 0) {
      return 0;
    }
    await redis.del(...keys);
    return keys.length;
  } catch (error) {
    console.error('[Admin Settings] Error clearing cache:', error);
    throw error;
  }
}

// Webhook history management
export interface WebhookHistoryEntry {
  id: string;
  timestamp: number;
  webhookName: string;
  webhookUrl: string;
  method: string;
  statusCode: number | null;
  success: boolean;
  error?: string;
  reason: string; // e.g., "CPU threshold exceeded: 85%"
  responseTime: number; // in milliseconds
}

const WEBHOOK_HISTORY_KEY = 'webhook:history';
const MAX_HISTORY_ENTRIES = 100;

export async function addWebhookHistory(entry: WebhookHistoryEntry): Promise<void> {
  try {
    await ensureRedisConnection();

    // Get existing history
    const historyJson = await redis.get(WEBHOOK_HISTORY_KEY);
    let history: WebhookHistoryEntry[] = historyJson ? JSON.parse(historyJson) : [];

    // Add new entry at the beginning
    history.unshift(entry);

    // Keep only last MAX_HISTORY_ENTRIES
    if (history.length > MAX_HISTORY_ENTRIES) {
      history = history.slice(0, MAX_HISTORY_ENTRIES);
    }

    // Save back to Redis
    await redis.set(WEBHOOK_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('[Admin Settings] Error adding webhook history:', error);
  }
}

export async function getWebhookHistory(): Promise<WebhookHistoryEntry[]> {
  try {
    await ensureRedisConnection();
    const historyJson = await redis.get(WEBHOOK_HISTORY_KEY);
    return historyJson ? JSON.parse(historyJson) : [];
  } catch (error) {
    console.error('[Admin Settings] Error getting webhook history:', error);
    return [];
  }
}

export async function clearWebhookHistory(): Promise<void> {
  try {
    await ensureRedisConnection();
    await redis.del(WEBHOOK_HISTORY_KEY);
  } catch (error) {
    console.error('[Admin Settings] Error clearing webhook history:', error);
    throw error;
  }
}
