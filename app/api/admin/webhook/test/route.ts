// app/api/admin/webhook/test/route.ts
import { validateSession } from '@/lib/admin-settings';
import { addWebhookHistory } from '@/lib/admin-settings';
import type { WebhookHistoryEntry } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

interface TestWebhookRequest {
  name: string;
  url: string;
  method: 'POST' | 'GET' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body: string;
}

async function executeWebhook(config: TestWebhookRequest): Promise<{
  success: boolean;
  statusCode: number | null;
  error?: string;
  responseTime: number;
}> {
  const startTime = Date.now();

  try {
    const headers: Record<string, string> = { ...config.headers };

    // Add content-type if body is provided and method supports body
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const fetchOptions: RequestInit = {
      method: config.method,
      headers,
    };

    // Add body for methods that support it
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
      fetchOptions.body = config.body;
    }

    const response = await fetch(config.url, fetchOptions);
    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      statusCode: response.status,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      statusCode: null,
      error: (error as Error).message,
      responseTime,
    };
  }
}

export async function POST(req: Request) {
  try {
    // Validate admin session
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const isValid = await validateSession(token);

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const webhookConfig: TestWebhookRequest = await req.json();

    // Execute webhook
    const result = await executeWebhook(webhookConfig);

    // Save to history
    const historyEntry: WebhookHistoryEntry = {
      id: `test-${Date.now()}`,
      timestamp: Date.now(),
      webhookName: webhookConfig.name,
      webhookUrl: webhookConfig.url,
      method: webhookConfig.method,
      statusCode: result.statusCode,
      success: result.success,
      error: result.error,
      reason: 'Manual test from admin panel',
      responseTime: result.responseTime,
    };

    await addWebhookHistory(historyEntry);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Webhook Test] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
