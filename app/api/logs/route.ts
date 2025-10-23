// app/api/logs/route.ts
import { promises as fs } from 'fs';
import { getAdminSettings } from '@/lib/admin-settings';

export const dynamic = 'force-dynamic';

interface LogEntry {
  id: string;
  label: string;
  lines: string[];
  error?: string;
  size: number;
  mtime: number;
}

async function readLogFile(path: string, maxLines: number = 100): Promise<{ lines: string[]; size: number; mtime: number }> {
  try {
    const stats = await fs.stat(path);
    const content = await fs.readFile(path, 'utf-8');
    const allLines = content.split('\n').filter(line => line.trim() !== '');
    const lines = allLines.slice(-maxLines); // Get last N lines

    return {
      lines,
      size: stats.size,
      mtime: stats.mtimeMs,
    };
  } catch (error) {
    throw new Error(`Failed to read file: ${(error as Error).message}`);
  }
}

async function readLogFileFromOffset(path: string, offset: number): Promise<{ lines: string[]; size: number; mtime: number }> {
  try {
    const stats = await fs.stat(path);

    // If file is smaller than offset, it was truncated - read from beginning
    if (stats.size < offset) {
      const content = await fs.readFile(path, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim() !== '');
      return {
        lines: allLines,
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    }

    // If file size is same, no new data
    if (stats.size === offset) {
      return {
        lines: [],
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    }

    // Read only new data from offset
    const fileHandle = await fs.open(path, 'r');
    const buffer = Buffer.alloc(stats.size - offset);
    await fileHandle.read(buffer, 0, buffer.length, offset);
    await fileHandle.close();

    const newContent = buffer.toString('utf-8');
    const newLines = newContent.split('\n').filter(line => line.trim() !== '');

    return {
      lines: newLines,
      size: stats.size,
      mtime: stats.mtimeMs,
    };
  } catch (error) {
    throw new Error(`Failed to read file from offset: ${(error as Error).message}`);
  }
}

export async function GET(req: Request) {
  try {
    const settings = await getAdminSettings();
    const url = new URL(req.url);
    const maxLines = parseInt(url.searchParams.get('maxLines') || '100');

    // Parse offsets from query params (format: fileId:offset,fileId:offset,...)
    const offsetsParam = url.searchParams.get('offsets') || '';
    const offsets = new Map<string, number>();
    if (offsetsParam) {
      for (const pair of offsetsParam.split(',')) {
        const [id, offset] = pair.split(':');
        if (id && offset) {
          offsets.set(id, parseInt(offset));
        }
      }
    }

    const enabledFiles = settings.logs.files.filter(f => f.enabled);

    const logs: LogEntry[] = await Promise.all(
      enabledFiles.map(async (fileConfig) => {
        try {
          const offset = offsets.get(fileConfig.id);
          const result = offset !== undefined
            ? await readLogFileFromOffset(fileConfig.path, offset)
            : await readLogFile(fileConfig.path, maxLines);

          return {
            id: fileConfig.id,
            label: fileConfig.label,
            lines: result.lines,
            size: result.size,
            mtime: result.mtime,
          };
        } catch (error) {
          return {
            id: fileConfig.id,
            label: fileConfig.label,
            lines: [],
            error: (error as Error).message,
            size: 0,
            mtime: 0,
          };
        }
      })
    );

    return new Response(JSON.stringify(logs), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[/api/logs] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
