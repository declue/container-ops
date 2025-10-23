// metrics-cron.ts
import cron from "node-cron";
import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { redis, ensureRedisConnection } from "@/lib/redis";

const execAsync = promisify(exec);

// ------- Globals -------
let lastCpuUsageNs = 0;
let lastTsContainer = 0;
const prevProcTimes = new Map<number, { jiffies: number; ts: number }>();

let CLK_TCK = 100;
let PAGE_SIZE = 4096;

const WEEK_SEC = 7 * 24 * 60 * 60;
const PROC_MAX = Math.max(1, parseInt(process.env.PROC_MAX || "8192", 10) || 8192);

const ENV_PROC_MODE = (process.env.PROC_MODE || "all").toLowerCase().trim();
const ENV_PROC_UIDS = process.env.PROC_UIDS?.trim();

// ------- Helpers -------
async function detectCgroupVersion(): Promise<"v1" | "v2"> {
  try {
    const mounts = await fs.readFile("/proc/mounts", "utf8");
    return mounts.includes("cgroup2") ? "v2" : "v1";
  } catch {
    return "v1";
  }
}

async function readNumber(path: string): Promise<number> {
  try {
    const value = await fs.readFile(path, "utf8");
    const n = parseInt(value.trim(), 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

async function getCpuLimit(version: "v1" | "v2"): Promise<number> {
  try {
    if (version === "v2") {
      const cpuMax = await fs.readFile("/sys/fs/cgroup/cpu.max", "utf8").catch(() => "");
      if (cpuMax) {
        const [quotaStr, periodStr] = cpuMax.trim().split(" ");
        const quota = parseInt(quotaStr, 10);
        const period = parseInt(periodStr, 10);
        if (quota > 0 && period > 0) return quota / period;
      }
    } else {
      const [quotaStr, periodStr] = await Promise.all([
        fs.readFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "utf8").catch(() => "0"),
        fs.readFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us", "utf8").catch(() => "100000"),
      ]);
      const quota = parseInt(quotaStr.trim(), 10);
      const period = parseInt(periodStr.trim(), 10);
      if (quota > 0 && period > 0) return quota / period;
    }
    return os.cpus().length;
  } catch {
    return os.cpus().length;
  }
}

async function ensureSysConf() {
  try {
    const { stdout } = await execAsync("getconf CLK_TCK || echo 100");
    const n = parseInt(stdout.trim(), 10);
    if (!isNaN(n) && n > 0) CLK_TCK = n;
  } catch {}
  try {
    const { stdout } = await execAsync("getconf PAGESIZE || echo 4096");
    const n = parseInt(stdout.trim(), 10);
    if (!isNaN(n) && n > 0) PAGE_SIZE = n;
  } catch {}
}

async function getDf(path: string): Promise<{ total: number; used: number } | null> {
  try {
    const { stdout } = await execAsync(`df -k ${path}`);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    const totalKB = parseInt(parts[1]);
    const usedKB = parseInt(parts[2]);
    if (isNaN(totalKB) || isNaN(usedKB)) return null;
    return { total: totalKB * 1024, used: usedKB * 1024 };
  } catch {
    return null;
  }
}

function buildAllowedUidSet(): Set<number> | null {
  const myUid = typeof (process as any).getuid === "function" ? (process as any).getuid() : 0;

  if (ENV_PROC_UIDS) {
    const set = new Set<number>();
    for (const part of ENV_PROC_UIDS.split(",").map((s) => s.trim()).filter(Boolean)) {
      const n = parseInt(part, 10);
      if (!isNaN(n)) set.add(n);
    }
    if (set.size === 0) set.add(myUid);
    return set;
  }

  switch (ENV_PROC_MODE) {
    case "user":
      return new Set([myUid]);
    case "user+root":
      return new Set([myUid, 0]);
    case "all":
    default:
      return null;
  }
}

async function getPidUid(pid: number): Promise<number | null> {
  try {
    const s = await fs.readFile(`/proc/${pid}/status`, "utf8");
    const m = s.match(/^Uid:\s+(\d+)/m);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

async function getPidCmdline(pid: number): Promise<string> {
  try {
    const buf = await fs.readFile(`/proc/${pid}/cmdline`);
    if (!buf || buf.length === 0) return getPidComm(pid);
    const parts = buf.toString("utf8").split("\0").filter(Boolean);
    return parts.join(" ");
  } catch {
    return getPidComm(pid);
  }
}

async function getPidComm(pid: number): Promise<string> {
  try {
    const s = await fs.readFile(`/proc/${pid}/comm`, "utf8");
    return s.trim();
  } catch {
    return "";
  }
}

async function getPidTimesAndPpid(pid: number): Promise<{ jiffies: number; ppid: number } | null> {
  try {
    const stat = await fs.readFile(`/proc/${pid}/stat`, "utf8");
    const rparen = stat.lastIndexOf(")");
    if (rparen < 0) return null;
    const after = stat.slice(rparen + 2).trim();
    const parts = after.split(/\s+/);
    const ppid = parseInt(parts[1], 10) || 0;
    const utime = parseInt(parts[11], 10) || 0;
    const stime = parseInt(parts[12], 10) || 0;
    return { jiffies: utime + stime, ppid };
  } catch {
    return null;
  }
}

async function getPidRssBytes(pid: number): Promise<number> {
  try {
    const s = await fs.readFile(`/proc/${pid}/status`, "utf8");
    const m = s.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (m) return parseInt(m[1], 10) * 1024;
    const statm = await fs.readFile(`/proc/${pid}/statm`, "utf8").catch(() => "");
    if (statm) {
      const [_, resident] = statm.trim().split(/\s+/).map((x) => parseInt(x, 10));
      if (!isNaN(resident)) return resident * PAGE_SIZE;
    }
    return 0;
  } catch {
    return 0;
  }
}

async function mapUidNames(uids: number[]): Promise<Record<string, string>> {
  const set = new Set(uids);
  const out: Record<string, string> = {};
  try {
    const passwd = await fs.readFile("/etc/passwd", "utf8");
    for (const line of passwd.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(":");
      if (parts.length < 3) continue;
      const name = parts[0];
      const uid = parseInt(parts[2], 10);
      if (set.has(uid)) out[String(uid)] = name;
    }
  } catch {
    // ignore
  }
  // fallback label for unmapped uids
  for (const uid of set) {
    if (!out[String(uid)]) out[String(uid)] = String(uid);
  }
  return out;
}

// ------- per-process sampling -------
async function listProcessSamples(now: number, cpuLimit: number, memLimitBytes: number) {
  const allowedUids = buildAllowedUidSet();

  let pids: number[] = [];
  try {
    const entries = await fs.readdir("/proc", { withFileTypes: true });
    pids = entries
      .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
      .map((e) => parseInt(e.name, 10));
  } catch {}

  const samples: Array<{
    pid: number;
    uid: number | null;
    ppid: number;
    command: string;
    cpu_percent?: number;
    mem_bytes: number;
    mem_percent?: number;
  }> = [];

  for (const pid of pids) {
    const uid = await getPidUid(pid);
    if (allowedUids !== null) {
      if (uid === null || !allowedUids.has(uid)) continue;
    }

    const [cmdline, times, rssBytes] = await Promise.all([
      getPidCmdline(pid),
      getPidTimesAndPpid(pid),
      getPidRssBytes(pid),
    ]);
    if (!times) continue;

    const { jiffies, ppid } = times;
    const prev = prevProcTimes.get(pid);
    const deltaSec = prev ? (now - prev.ts) / 1000 : 0;

    let cpuPct: number | undefined;
    if (prev && deltaSec > 0) {
      const deltaJ = jiffies - prev.jiffies;
      const cpuTimeSec = deltaJ / CLK_TCK;
      cpuPct = Math.min(100, Math.max(0, (cpuTimeSec / deltaSec) * (100 / Math.max(cpuLimit, 1e-6))));
    }

    prevProcTimes.set(pid, { jiffies, ts: now });

    const memPct = memLimitBytes > 0 ? (rssBytes / memLimitBytes) * 100 : undefined;

    samples.push({
      pid,
      uid,
      ppid,
      command: cmdline || "(unknown)",
      cpu_percent: cpuPct,
      mem_bytes: rssBytes,
      mem_percent: memPct,
    });

    if (samples.length >= PROC_MAX) break;
  }

  // cleanup disappeared PIDs
  for (const [pid] of prevProcTimes) {
    if (!pids.includes(pid)) prevProcTimes.delete(pid);
  }

  samples.sort((a, b) => (b.cpu_percent ?? 0) - (a.cpu_percent ?? 0) || b.mem_bytes - a.mem_bytes);
  return samples;
}

// ------- collect -------
async function collectMetrics() {
  try {
    await ensureRedisConnection();
    await ensureSysConf();
    const version = await detectCgroupVersion();

    // Memory
    let memLimit = 0;
    let memUsage = 0;
    if (version === "v2") {
      memLimit = await readNumber("/sys/fs/cgroup/memory.max");
      memUsage = await readNumber("/sys/fs/cgroup/memory.current");
      if (memLimit <= 0 || memLimit === Number.MAX_SAFE_INTEGER) {
        const meminfo = await fs.readFile("/proc/meminfo", "utf8");
        const matched = /MemTotal:\s+(\d+)/.exec(meminfo);
        memLimit = matched ? parseInt(matched[1]) * 1024 : 0;
      }
    } else {
      memLimit = await readNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
      memUsage = await readNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
    }
    const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

    // CPU (container)
    const cpuStatPath = version === "v2" ? "/sys/fs/cgroup/cpu.stat" : "/sys/fs/cgroup/cpuacct/cpuacct.usage";
    let usageNs = 0;
    if (version === "v2") {
      const stat = await fs.readFile(cpuStatPath, "utf8");
      const usageLine = stat.split("\n").find((l) => l.startsWith("usage_usec"));
      if (usageLine) {
        const usageUs = parseInt(usageLine.split(" ")[1]);
        usageNs = usageUs * 1000;
      }
    } else {
      usageNs = await readNumber(cpuStatPath);
    }

    const now = Date.now();
    const cpuLimit = await getCpuLimit(version);
    let cpuUsagePercent = 0;
    if (lastCpuUsageNs && lastTsContainer) {
      const deltaUsage = usageNs - lastCpuUsageNs;
      const deltaTimeNs = (now - lastTsContainer) * 1e6;
      cpuUsagePercent = ((deltaUsage / deltaTimeNs) * 100) / Math.max(cpuLimit, 1e-6);
    }
    lastCpuUsageNs = usageNs;
    lastTsContainer = now;
    cpuUsagePercent = Math.min(100, Math.max(0, cpuUsagePercent));

    // Storage
    let storage = await getDf("/config");
    if (!storage) storage = await getDf("/");
    const storageTotal = storage?.total ?? 0;
    const storageUsed = storage?.used ?? 0;
    const storagePercent = storageTotal > 0 ? (storageUsed / storageTotal) * 100 : 0;

    // Processes
    const processes = await listProcessSamples(now, cpuLimit, memLimit);
    const uidSet = new Set<number>();
    for (const p of processes) if (typeof p.uid === "number") uidSet.add(p.uid);
    const uid_name_map = await mapUidNames(Array.from(uidSet));

    const data = {
      timestamp: now,

      cpu_limit: cpuLimit,
      cpu_usage_percent: Number.isFinite(cpuUsagePercent) ? cpuUsagePercent.toFixed(2) : "0.00",

      memory_limit_bytes: memLimit,
      memory_usage_bytes: memUsage,
      memory_usage_percent: Number.isFinite(memPercent) ? memPercent.toFixed(2) : "0.00",

      storage_total_bytes: storageTotal,
      storage_used_bytes: storageUsed,
      storage_usage_percent: Number.isFinite(storagePercent) ? storagePercent.toFixed(2) : "0.00",

      uid_name_map,

      processes: processes.map((p) => ({
        pid: p.pid,
        uid: p.uid,
        ppid: p.ppid,
        command: p.command,
        cpu_usage_percent: p.cpu_percent != null && isFinite(p.cpu_percent) ? p.cpu_percent.toFixed(2) : null,
        memory_usage_bytes: p.mem_bytes,
        memory_usage_percent: p.mem_percent != null && isFinite(p.mem_percent) ? p.mem_percent.toFixed(2) : null,
      })),
    };

    const key = `metrics:${now}`;
    await redis.set(key, JSON.stringify(data));
    await redis.expire(key, WEEK_SEC);

    console.log(
      `[cron] ${new Date().toLocaleTimeString()} CPU:${data.cpu_usage_percent}% MEM:${data.memory_usage_percent}% STOR:${data.storage_usage_percent}% procs:${data.processes.length}`
    );

    // Check thresholds and send webhook notifications
    await checkThresholds(cpuUsagePercent, memPercent, storagePercent);
  } catch (e) {
    console.error("[cron] metrics collection failed:", e);
  }
}

// Track last notification timestamps to avoid spam
const lastNotificationTime: { cpu?: number; memory?: number; storage?: number } = {};
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown

async function checkThresholds(cpu: number, memory: number, storage: number): Promise<void> {
  try {
    const { getAdminSettings } = await import("./admin-settings");
    const { sendWebhookNotification } = await import("./webhook");

    const settings = await getAdminSettings();

    if (!settings.thresholds.enabled) {
      return;
    }

    const now = Date.now();

    // Check CPU threshold
    if (cpu >= settings.thresholds.cpu) {
      const lastNotif = lastNotificationTime.cpu || 0;
      if (now - lastNotif >= NOTIFICATION_COOLDOWN) {
        await sendWebhookNotification('cpu', cpu, settings.thresholds.cpu);
        lastNotificationTime.cpu = now;
      }
    }

    // Check Memory threshold
    if (memory >= settings.thresholds.memory) {
      const lastNotif = lastNotificationTime.memory || 0;
      if (now - lastNotif >= NOTIFICATION_COOLDOWN) {
        await sendWebhookNotification('memory', memory, settings.thresholds.memory);
        lastNotificationTime.memory = now;
      }
    }

    // Check Storage threshold
    if (storage >= settings.thresholds.storage) {
      const lastNotif = lastNotificationTime.storage || 0;
      if (now - lastNotif >= NOTIFICATION_COOLDOWN) {
        await sendWebhookNotification('storage', storage, settings.thresholds.storage);
        lastNotificationTime.storage = now;
      }
    }
  } catch (error) {
    console.error("[cron] threshold check failed:", error);
  }
}

cron.schedule("*/5 * * * * *", collectMetrics);
collectMetrics();

