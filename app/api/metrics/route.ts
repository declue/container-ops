// app/api/metrics/route.ts
import { redis, ensureRedisConnection } from "@/lib/redis";

export const dynamic = "force-dynamic";

type AnyRedis = any;
const DEFAULT_LIMIT = 200;

async function listMetricKeys(pattern: string, limit: number): Promise<string[]> {
  const r = redis as AnyRedis;

  try {
    if (typeof r.keys === "function") {
      const keys: string[] = await r.keys(pattern);
      if (Array.isArray(keys)) return keys.slice(0, limit * 5);
    }
  } catch {}

  const found: string[] = [];
  let cursor: string | number = "0";
  for (let i = 0; i < 100; i++) {
    try {
      if (typeof r.scan === "function") {
        try {
          const res: any = await r.scan(cursor, { MATCH: pattern, COUNT: 1000 } as any);
          const arr = Array.isArray(res) ? res : [res?.cursor, res?.keys];
          cursor = String(arr[0] ?? "0");
          const keys = arr[1] ?? [];
          if (Array.isArray(keys)) {
            for (const k of keys) {
              found.push(k);
              if (found.length >= limit * 5) return found;
            }
          }
          if (cursor === "0") break;
          continue;
        } catch {
          const res: any = await r.scan(cursor, "MATCH", pattern, "COUNT", 1000);
          const arr = res as [string, string[]];
          cursor = String(arr?.[0] ?? "0");
          const keys = arr?.[1] ?? [];
          if (Array.isArray(keys)) {
            for (const k of keys) {
              found.push(k);
              if (found.length >= limit * 5) return found;
            }
          }
          if (cursor === "0") break;
          continue;
        }
      }
    } catch {
      break;
    }
  }
  return found;
}

async function mgetCompat(keys: string[]): Promise<(string | null)[]> {
  const r = redis as AnyRedis;
  try {
    if (typeof r.mGet === "function") return await r.mGet(keys);
  } catch {}
  try {
    if (typeof r.mget === "function") return await r.mget(keys);
  } catch {}
  const out: (string | null)[] = [];
  for (const k of keys) {
    try {
      const v = await r.get(k);
      out.push(typeof v === "string" ? v : (v ? String(v) : null));
    } catch {
      out.push(null);
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    await ensureRedisConnection();

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "") || DEFAULT_LIMIT, 2000));
    const since = parseInt(url.searchParams.get("since") || "") || 0;

    const keys = await listMetricKeys("metrics:*", limit);
    if (!keys.length) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const keyed = keys
      .map((k) => ({ k, ts: Number(k.split(":")[1]) }))
      .filter((x) => Number.isFinite(x.ts) && x.ts >= since)
      .sort((a, b) => a.ts - b.ts);

    if (!keyed.length) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const last = keyed.slice(-limit);
    const lastKeys = last.map((x) => x.k);
    const rawValues = await mgetCompat(lastKeys);

    const payload: any[] = [];
    for (let i = 0; i < rawValues.length; i++) {
      const raw = rawValues[i];
      if (!raw) continue;
      let obj: any = null;
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = raw;
      }
      if (obj) payload.push({ value: obj });
    }

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/metrics] 500:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

