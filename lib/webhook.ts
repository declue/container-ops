// lib/webhook.ts
import { getAdminSettings, addWebhookHistory } from './admin-settings';
import type { WebhookConfig, WebhookHistoryEntry } from './admin-settings';

interface WebhookPayload {
  timestamp: number;
  alert: string;
  resource: 'cpu' | 'memory' | 'storage';
  currentValue: number;
  threshold: number;
  message: string;
}

export async function sendWebhookNotification(
  resource: 'cpu' | 'memory' | 'storage',
  currentValue: number,
  threshold: number
): Promise<void> {
  try {
    const settings = await getAdminSettings();

    // Check if thresholds are enabled
    if (!settings.thresholds.enabled) {
      return;
    }

    // Get enabled webhooks
    const enabledWebhooks = settings.webhooks.configs.filter(w => w.enabled);

    if (enabledWebhooks.length === 0) {
      return;
    }

    // Create payload
    const payload: WebhookPayload = {
      timestamp: Date.now(),
      alert: `${resource.toUpperCase()} threshold exceeded`,
      resource,
      currentValue,
      threshold,
      message: `${resource.toUpperCase()} usage (${currentValue.toFixed(1)}%) has exceeded the threshold of ${threshold}%`,
    };

    // Send to all enabled webhooks
    const promises = enabledWebhooks.map(webhook =>
      executeWebhook(webhook, payload, `${resource.toUpperCase()} threshold exceeded: ${currentValue.toFixed(1)}%`)
    );

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('[Webhook] Error sending notification:', error);
  }
}

async function executeWebhook(
  config: WebhookConfig,
  payload: WebhookPayload,
  reason: string
): Promise<void> {
  const startTime = Date.now();

  try {
    const headers: Record<string, string> = { ...config.headers };

    // Process body template with payload
    let body = config.body;
    try {
      // Replace template variables in body
      body = body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (key in payload) {
          return String((payload as any)[key]);
        }
        return match;
      });
    } catch (e) {
      console.error('[Webhook] Error processing body template:', e);
    }

    // Add content-type if body is provided and method supports body
    if (body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const fetchOptions: RequestInit = {
      method: config.method,
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    };

    // Add body for methods that support it
    if (body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      fetchOptions.body = body;
    }

    const response = await fetch(config.url, fetchOptions);
    const responseTime = Date.now() - startTime;

    // Save to history
    const historyEntry: WebhookHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      webhookName: config.name,
      webhookUrl: config.url,
      method: config.method,
      statusCode: response.status,
      success: response.ok,
      reason,
      responseTime,
    };

    await addWebhookHistory(historyEntry);

    if (!response.ok) {
      console.warn(`[Webhook] ${config.name} returned status ${response.status}`);
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Save error to history
    const historyEntry: WebhookHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      webhookName: config.name,
      webhookUrl: config.url,
      method: config.method,
      statusCode: null,
      success: false,
      error: (error as Error).message,
      reason,
      responseTime,
    };

    await addWebhookHistory(historyEntry);

    console.error(`[Webhook] Error executing ${config.name}:`, error);
  }
}
