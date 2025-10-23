"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { RefreshCw, Download, Cpu, HardDrive, Database, Bug, Moon, Sun } from "lucide-react";

/* ============================= *
 *            Types
 * ============================= */
interface ProcRaw {
  pid: number | string;
  uid?: number | string | null;
  ppid?: number | string | null;
  command?: string;
  cpu_usage_percent?: number | string | null;
  memory_usage_bytes?: number | string | null;
  memory_usage_percent?: number | string | null;
}

interface MetricValueRaw {
  timestamp: number | string;
  memory_limit_bytes?: number | string;
  memory_usage_bytes?: number | string;
  memory_usage_percent?: number | string;
  cpu_limit?: number | string; // vCPU
  cpu_usage_percent?: number | string;
  storage_total_bytes?: number | string;
  storage_used_bytes?: number | string;
  storage_usage_percent?: number | string;
  uid_name_map?: Record<string, string>;
  processes?: ProcRaw[];
}

interface MetricRecordRaw {
  value: MetricValueRaw;
}

interface Point {
  ts: number;
  cpu?: number;
  mem?: number;
  storage?: number;
}

interface Capacities {
  cpuLimit?: number;
  memoryLimitBytes?: number;
  storageTotalBytes?: number;
  memoryUsedBytes?: number;
  storageUsedBytes?: number;
}

interface ProcItem {
  pid: number;
  uid?: number;
  user?: string; // derived
  ppid?: number;
  command: string;
  cpu?: number;
  memBytes?: number;
  memPct?: number;
}

/* ============================= *
 *          Helpers
 * ============================= */
const pct = (v: number | undefined) =>
  typeof v === "number" && isFinite(v) ? `${v.toFixed(1)}%` : "—";
const toGB = (bytes?: number) =>
  bytes == null || !isFinite(bytes) ? "—" : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const humanBytes = (bytes?: number) => {
  if (bytes == null || !isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
};
const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function n(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function canon(
  raw: MetricRecordRaw[]
): {
  series: Point[];
  caps?: Capacities;
  latestRaw?: MetricValueRaw;
  procs: ProcItem[];
  uidNameMap: Record<string, string>;
} {
  if (!Array.isArray(raw)) return { series: [], procs: [], uidNameMap: {} };
  const rows = raw.map((r) => r?.value).filter(Boolean) as MetricValueRaw[];

  rows.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  const series: Point[] = rows
    .map((v) => ({
      ts: Number(v.timestamp),
      cpu: n(v.cpu_usage_percent),
      mem: n(v.memory_usage_percent),
      storage: n(v.storage_usage_percent),
    }))
    .filter((p) => Number.isFinite(p.ts));

  const last = rows[rows.length - 1];
  const caps: Capacities | undefined = last
    ? {
        cpuLimit: n(last.cpu_limit),
        memoryLimitBytes: n(last.memory_limit_bytes),
        storageTotalBytes: n(last.storage_total_bytes),
        memoryUsedBytes: n(last.memory_usage_bytes),
        storageUsedBytes: n(last.storage_used_bytes),
      }
    : undefined;

  const uidNameMap: Record<string, string> = last?.uid_name_map ?? {};

  const procs: ProcItem[] = Array.isArray(last?.processes)
    ? (last!.processes as ProcRaw[])
        .map((p) => {
          const uid = p.uid != null ? Number(p.uid) : undefined;
          const user = uid != null ? uidNameMap[String(uid)] : undefined;
          return {
            pid: Number(p.pid),
            uid,
            user,
            ppid: p.ppid != null ? Number(p.ppid) : undefined,
            command: p.command || "",
            cpu: n(p.cpu_usage_percent),
            memBytes: n(p.memory_usage_bytes),
            memPct: n(p.memory_usage_percent),
          };
        })
        .filter((p) => Number.isFinite(p.pid))
    : [];

  return { series, caps, latestRaw: last, procs, uidNameMap };
}

function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");
}

/* ============================= *
 *           Component
 * ============================= */
export default function MonitorPage() {
  const [mounted, setMounted] = useState(false); // SSR width guard
  const [isDark, setIsDark] = useState(false);

  const [data, setData] = useState<Point[]>([]);
  const [caps, setCaps] = useState<Capacities | undefined>(undefined);
  const [latestRaw, setLatestRaw] = useState<MetricValueRaw | undefined>(undefined);
  const [procs, setProcs] = useState<ProcItem[]>([]);
  const [uidNameMap, setUidNameMap] = useState<Record<string, string>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState(10_000);

  // process table state
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"cpu" | "mem" | "pid" | "uid" | "ppid">("cpu");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // mount + theme
  useEffect(() => {
    setMounted(true);
    const preferred = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null;
    const dark = saved ? saved === "dark" : preferred;
    setIsDark(dark);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {}
  }, [isDark, mounted]);

  // theme-aware chart colors
  const axisTick = isDark ? "#E5E7EB" : "#374151";
  const gridStroke = isDark ? "#3F3F46" : "#E5E7EB";
  const tooltipBg = isDark ? "#0B0F14" : "#ffffff";
  const tooltipFg = isDark ? "#E5E7EB" : "#111827";
  const tooltipBorder = isDark ? "#52525B" : "#E5E7EB";

  // Fetch metrics
  async function fetchMetrics() {
    try {
      const res = await fetch(`/api/metrics?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as MetricRecordRaw[];
      const { series, caps, latestRaw, procs, uidNameMap } = canon(json);

      const cleaned = series.map((p) => ({
        ts: p.ts,
        cpu: typeof p.cpu === "number" && isFinite(p.cpu) ? p.cpu : undefined,
        mem: typeof p.mem === "number" && isFinite(p.mem) ? p.mem : undefined,
        storage: typeof p.storage === "number" && isFinite(p.storage) ? p.storage : undefined,
      }));

      setData(cleaned);
      setCaps(caps);
      setLatestRaw(latestRaw);
      setProcs(procs);
      setUidNameMap(uidNameMap);
      setPage(1);
    } catch (e) {
      console.error("[Monitor] fetch failed:", e);
    }
  }

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!autoRefresh) return;
    timerRef.current = setInterval(fetchMetrics, refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, refreshMs]);

  const latest = data[data.length - 1];

  const cpuPie = useMemo(() => {
    const used = latest?.cpu ?? 0;
    return [{ name: "Used", value: used }, { name: "Idle", value: Math.max(0, 100 - used) }];
  }, [latest]);

  const memPie = useMemo(() => {
    const used = latest?.mem ?? 0;
    return [{ name: "Used", value: used }, { name: "Free", value: Math.max(0, 100 - used) }];
  }, [latest]);

  const storagePie = useMemo(() => {
    const used = latest?.storage ?? 0;
    return [{ name: "Used", value: used }, { name: "Free", value: Math.max(0, 100 - used) }];
  }, [latest]);

  // Insight data with short labels & tooltips
  const topCpu = useMemo(() => {
    return procs
      .filter((p) => (p.cpu ?? 0) > 0)
      .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
      .slice(0, 10)
      .map((p) => {
        const shortCmd = (p.command || "").slice(0, 15) + ((p.command || "").length > 15 ? "…" : "");
        return {
          pid: p.pid,
          name: `${p.pid} ${shortCmd}`,
          full: p.command || "",
          cpu: p.cpu ?? 0,
        };
      });
  }, [procs]);

  const topMem = useMemo(() => {
    return procs
      .slice()
      .sort((a, b) => (b.memBytes ?? 0) - (a.memBytes ?? 0))
      .slice(0, 10)
      .map((p) => {
        const shortCmd = (p.command || "").slice(0, 15) + ((p.command || "").length > 15 ? "…" : "");
        const memPct =
          p.memPct ??
          (caps?.memoryLimitBytes ? ((p.memBytes ?? 0) / (caps.memoryLimitBytes || 1)) * 100 : 0);
        return {
          pid: p.pid,
          name: `${p.pid} ${shortCmd}`,
          full: p.command || "",
          memPct,
        };
      });
  }, [procs, caps?.memoryLimitBytes]);

  function handleDownloadCSV() {
    const rows = data.map((p) => ({
      timestamp: new Date(p.ts).toISOString(),
      cpu: p.cpu,
      memory: p.mem,
      storage: p.storage,
    }));
    const csv = toCSV(rows as any);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `metrics.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // sorting/filter/paging
  const procRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = procs.filter((p) => {
      if (q === "") return true;
      return (
        p.command.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        String(p.uid ?? "").includes(q) ||
        String(p.ppid ?? "").includes(q) ||
        (p.user ?? "").toLowerCase().includes(q)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = filtered.sort((a, b) => {
      const by = (key: typeof sortKey) => {
        const va =
          key === "cpu" ? (a.cpu ?? 0) :
          key === "mem" ? (a.memPct ?? 0) :
          key === "pid" ? (a.pid ?? 0) :
          key === "uid" ? (a.uid ?? 0) :
          key === "ppid" ? (a.ppid ?? 0) : 0;
        const vb =
          key === "cpu" ? (b.cpu ?? 0) :
          key === "mem" ? (b.memPct ?? 0) :
          key === "pid" ? (b.pid ?? 0) :
          key === "uid" ? (b.uid ?? 0) :
          key === "ppid" ? (b.ppid ?? 0) : 0;
        return (va - vb) * dir;
      };
      const r = by(sortKey);
      if (r !== 0) return r;
      return (b.memBytes ?? 0) - (a.memBytes ?? 0) || (a.pid ?? 0) - (b.pid ?? 0);
    });

    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return { total, rows: sorted.slice(start, end) };
  }, [procs, query, sortKey, sortDir, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(procRows.total / pageSize));
  const cpuCoresNow =
    typeof latest?.cpu === "number" && typeof caps?.cpuLimit === "number"
      ? (latest.cpu * caps.cpuLimit) / 100
      : undefined;

  function onHeaderClick(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "pid" || key === "uid" || key === "ppid" ? "asc" : "desc");
    }
    setPage(1);
  }
  const sortMark = (key: typeof sortKey) =>
    sortKey !== key ? "" : sortDir === "asc" ? "▲" : "▼";

  // theme palette
  const brandTeal = "#0891b2";
  const brandBlue = "#2563eb";
  const brandViolet = "#7c3aed";

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 text-zinc-900 dark:from-zinc-950 dark:via-zinc-950 dark:to-black dark:text-zinc-100">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/85 backdrop-blur-md dark:bg-zinc-900/85 dark:border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
              <Cpu className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight truncate">System Monitor</h1>
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 ml-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800/80">CPU {caps?.cpuLimit ?? "—"} vCPU</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800/80">RAM {toGB(caps?.memoryLimitBytes)}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800/80">Storage {toGB(caps?.storageTotalBytes)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsDark((v) => !v)}
              className="rounded-lg border px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all active:scale-[0.98]"
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <select
              className="rounded-lg border px-2 py-1 text-sm border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              value={refreshMs}
              onChange={(e) => setRefreshMs(parseInt(e.target.value, 10))}
              title="Auto-refresh interval"
            >
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`rounded-lg border px-3 py-1 text-sm transition-all ${
                autoRefresh
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
              } active:scale-[0.98]`}
            >
              Auto {autoRefresh ? "On" : "Off"}
            </button>
            <button
              onClick={fetchMetrics}
              className="flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all active:scale-[0.98]"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all active:scale-[0.98]"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
        </div>
      </div>

      {/* Content — section 간 세로 간격 강화 */}
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 space-y-10">
        {/* KPI Row (모바일에서 카드 간 세로 간격 강화) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-6">
          <CardKPI
            icon={<Cpu className="text-emerald-600 dark:text-emerald-400" />}
            title="CPU Usage"
            value={
              typeof latest?.cpu === "number"
                ? `${latest.cpu.toFixed(1)}%${
                    typeof caps?.cpuLimit === "number" ? ` (${((latest.cpu * caps.cpuLimit) / 100).toFixed(2)} vCPU)` : ""
                  }`
                : "—"
            }
            subtitle={typeof caps?.cpuLimit === "number" ? `of ${caps.cpuLimit} vCPU` : undefined}
          />
          <CardKPI
            icon={<HardDrive className="text-sky-600 dark:text-sky-400" />}
            title="Memory Usage"
            value={typeof latest?.mem === "number" ? `${latest.mem.toFixed(1)}%` : "—"}
            subtitle={`${toGB(caps?.memoryUsedBytes)} / ${toGB(caps?.memoryLimitBytes)}`}
          />
          <CardKPI
            icon={<Database className="text-violet-600 dark:text-violet-400" />}
            title="Storage Usage"
            value={typeof latest?.storage === "number" ? `${latest.storage.toFixed(1)}%` : "—"}
            subtitle={`${toGB(caps?.storageUsedBytes)} / ${toGB(caps?.storageTotalBytes)}`}
          />
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="col-span-2 min-w-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 p-5">
            <h2 className="font-semibold mb-3 text-zinc-700 dark:text-zinc-200">CPU / Memory / Storage Trend</h2>
            <div className="w-full" style={{ height: 320 }}>
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={200}>
                  <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="ts" tickFormatter={formatTime} minTickGap={24} tick={{ fill: axisTick }} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: axisTick }} />
                    <Tooltip
                      labelFormatter={(v) => new Date(v as number).toLocaleString()}
                      formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                      contentStyle={{ backgroundColor: tooltipBg, color: tooltipFg, borderColor: tooltipBorder }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="cpu" name="CPU" stroke={brandTeal} dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="mem" name="Memory" stroke={brandBlue} dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="storage" name="Storage" stroke={brandViolet} dot={false} strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 p-5">
            <h2 className="font-semibold mb-3 text-zinc-700 dark:text-zinc-200">Usage Breakdown</h2>
            <div className="grid grid-cols-1 gap-4">
              <PieBlock title="CPU" color={brandTeal} data={cpuPie} height={120} axisTick={axisTick}
                footer={
                  typeof latest?.cpu === "number" && typeof caps?.cpuLimit === "number" ? (
                    <InlineStat label="Used" value={`${latest.cpu.toFixed(1)}% (${((latest.cpu * caps.cpuLimit)/100).toFixed(2)} vCPU)`} />
                  ) : null
                }
              />
              <PieBlock title="Memory" color={brandBlue} data={memPie} height={120} axisTick={axisTick}
                footer={
                  typeof latest?.mem === "number" ? (
                    <InlineStat label="Used" value={`${latest.mem.toFixed(1)}% (${toGB(caps?.memoryUsedBytes)})`} />
                  ) : null
                }
              />
              <PieBlock title="Storage" color={brandViolet} data={storagePie} height={120} axisTick={axisTick}
                footer={
                  typeof latest?.storage === "number" ? (
                    <InlineStat label="Used" value={`${latest.storage.toFixed(1)}% (${toGB(caps?.storageUsedBytes)})`} />
                  ) : null
                }
              />
            </div>
          </div>
        </div>

        {/* Insight Row — 1:1 equal width */}
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="min-w-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 p-5">
            <h2 className="font-semibold mb-3 text-zinc-700 dark:text-zinc-200">Top CPU Processes</h2>
            <div className="w-full" style={{ height: 300 }}>
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={topCpu} layout="vertical" margin={{ left: 100, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: axisTick }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={260}
                      tick={{ fill: axisTick }}
                      tickFormatter={(v: string) => v}
                    />
                    <Tooltip
                      formatter={(v: any, _n: string, p: any) => [`${Number(v).toFixed(1)}%`, p?.payload?.full || "Command"]}
                      contentStyle={{ backgroundColor: tooltipBg, color: tooltipFg, borderColor: tooltipBorder }}
                    />
                    <Bar dataKey="cpu" name="CPU" fill={brandTeal} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 p-5">
            <h2 className="font-semibold mb-3 text-zinc-700 dark:text-zinc-200">Top Memory Processes</h2>
            <div className="w-full" style={{ height: 300 }}>
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={topMem} layout="vertical" margin={{ left: 100, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: axisTick }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={260}
                      tick={{ fill: axisTick }}
                      tickFormatter={(v: string) => v}
                    />
                    <Tooltip
                      formatter={(v: any, _n: string, p: any) => [`${Number(v).toFixed(1)}%`, p?.payload?.full || "Command"]}
                      contentStyle={{ backgroundColor: tooltipBg, color: tooltipFg, borderColor: tooltipBorder }}
                    />
                    <Bar dataKey="memPct" name="Memory" fill={brandBlue} />
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        </div>

        {/* Process Monitor */}
        <ProcessMonitor
          processes={procs}
          memLimitBytes={caps?.memoryLimitBytes}
          cpuLimit={caps?.cpuLimit}
          uidNameMap={uidNameMap}
          query={query}
          setQuery={setQuery}
          sortKey={sortKey}
          sortDir={sortDir}
          onHeaderClick={onHeaderClick}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          total={procRows.total}
          rows={procRows.rows}
        />

        {/* Debug */}
        <details className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm text-zinc-700 dark:text-zinc-300">
          <summary className="cursor-pointer select-none flex items-center gap-2">
            <Bug className="h-4 w-4" /> Debug (latest raw)
          </summary>
          <div className="mt-3 grid sm:grid-cols-3 gap-3">
            <div><span className="text-zinc-500 dark:text-zinc-400">CPU limit:</span> {caps?.cpuLimit ?? "—"} vCPU</div>
            <div><span className="text-zinc-500 dark:text-zinc-400">RAM limit:</span> {toGB(caps?.memoryLimitBytes)}</div>
            <div><span className="text-zinc-500 dark:text-zinc-400">Storage total:</span> {toGB(caps?.storageTotalBytes)}</div>
          </div>
          <pre className="mt-3 overflow-auto rounded-lg bg-white dark:bg-zinc-950 p-3 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200">
            {JSON.stringify(latestRaw, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

/* ============================= *
 *     Process Monitor Section
 * ============================= */
function ProcessMonitor({
  processes,
  memLimitBytes,
  cpuLimit,
  uidNameMap,
  query,
  setQuery,
  sortKey,
  sortDir,
  onHeaderClick,
  page,
  setPage,
  pageSize,
  setPageSize,
  total,
  rows,
}: {
  processes: ProcItem[];
  memLimitBytes?: number;
  cpuLimit?: number;
  uidNameMap: Record<string, string>;
  query: string;
  setQuery: (v: string) => void;
  sortKey: "cpu" | "mem" | "pid" | "uid" | "ppid";
  sortDir: "asc" | "desc";
  onHeaderClick: (key: "cpu" | "mem" | "pid" | "uid" | "ppid") => void;
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  rows: ProcItem[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const HeadCell = (label: string, key: "cpu" | "mem" | "pid" | "uid" | "ppid", widthClass: string) => (
    <th
      className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 ${widthClass}`}
      onClick={() => onHeaderClick(key)}
      title="Click to sort"
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <SortMark active={sortKey === key} dir={sortDir} />
      </div>
    </th>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 p-5">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-zinc-700 dark:text-zinc-200">Processes ({total.toLocaleString()})</h2>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Filter by command / PID / UID / PPID / USER"
            className="flex-1 md:w-80 rounded-lg border px-3 py-1.5 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(1);
            }}
            className="rounded-lg border px-2 py-1.5 text-sm bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
            title="Rows per page"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={200}>200 / page</option>
          </select>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md border px-2 py-1 text-sm disabled:opacity-50 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ◀
            </button>
            <span className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              className="rounded-md border px-2 py-1 text-sm disabled:opacity-50 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              ▶
            </button>
          </div>
        </div>
      </div>

      {/* table-fixed: COMMAND이 길어도 다른 컬럼 폭이 흔들리지 않음 */}
      <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm table-fixed">
          <colgroup>
            <col className="w-24" />
            <col className="w-36" />
            <col className="w-24" />
            <col className="w-52" />
            <col className="w-60" />
            <col className="w-32" />
            <col /> {/* COMMAND: 남은 공간 모두 */}
          </colgroup>
          <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              {HeadCell("PID", "pid", "w-24")}
              {/* USER(col) + UID(col) 분리 */}
              <th className="px-3 py-2 font-medium w-36">USER</th>
              {HeadCell("UID", "uid", "w-24")}
              {HeadCell("CPU", "cpu", "w-52")}
              {HeadCell("Memory", "mem", "w-60")}
              <th className="px-3 py-2 font-medium w-32">RSS</th>
              <th className="px-3 py-2 font-medium">COMMAND</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((p) => {
              const cpu = p.cpu ?? 0;
              const memPct = p.memPct ?? (memLimitBytes ? ((p.memBytes ?? 0) / memLimitBytes) * 100 : 0);
              const cpuCore = typeof cpuLimit === "number" ? (cpu * cpuLimit) / 100 : undefined;
              const user = p.user || (p.uid != null ? uidNameMap[String(p.uid)] : undefined) || "—";
              const userLabel = p.uid != null ? `${user} (${p.uid})` : user;

              return (
                <tr
                  key={`${p.pid}`}
                  className="odd:bg-zinc-50/40 even:bg-white dark:odd:bg-zinc-800/40 dark:even:bg-zinc-900/40 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/70 transition-colors"
                >
                  <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200"> {p.pid} </td>
                  <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200 truncate">{userLabel}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">{p.uid ?? "—"}</td>
                  <td className="px-3 py-2">
                    <ProgBar
                      value={cpu}
                      suffix="%"
                      showValue
                      valueLabel={
                        typeof cpu === "number"
                          ? `${cpu.toFixed(1)}%${typeof cpuCore === "number" ? ` (${cpuCore.toFixed(2)} vCPU)` : ""}`
                          : "—"
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <ProgBar
                      value={memPct}
                      suffix="%"
                      color="sky"
                      showValue
                      valueLabel={`${memPct.toFixed(1)}% (${humanBytes(p.memBytes)})`}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-800 dark:text-zinc-200">{humanBytes(p.memBytes)}</td>
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">
                    {/* COMMAND은 한 줄로 truncate + title로 전체 표시 */}
                    <div className="truncate" title={p.command || "(unknown)"}>{p.command || "(unknown)"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Showing {rows.length.toLocaleString()} of {total.toLocaleString()} processes (normalized to container limits).
      </p>
    </div>
  );
}

/* ============================= *
 *        UI Subcomponents
 * ============================= */

function CardKPI({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center gap-2 text-xs uppercase text-zinc-500 dark:text-zinc-400 tracking-wide">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          {icon}
        </span>
        <span className="truncate">{title}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100 truncate">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 truncate">{subtitle}</div>}
    </div>
  );
}

function ProgBar({
  value,
  suffix = "%",
  color = "emerald",
  showValue = false,
  valueLabel,
}: {
  value?: number;
  suffix?: string;
  color?: "emerald" | "sky" | "violet" | string;
  showValue?: boolean;
  valueLabel?: string;
}) {
  const v = typeof value === "number" && isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-600 dark:bg-emerald-500",
    sky: "bg-sky-600 dark:bg-sky-500",
    violet: "bg-violet-600 dark:bg-violet-500",
  };
  const barColor = colorMap[color as keyof typeof colorMap] || "bg-zinc-700 dark:bg-zinc-400";
  return (
    <div className="flex flex-col gap-1">
      {showValue && (
        <div className="text-xs text-zinc-700 dark:text-zinc-300 tabular-nums">
          {valueLabel ?? `${v.toFixed(1)}${suffix}`}
        </div>
      )}
      <div className="relative h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div className={`absolute left-0 top-0 h-full ${barColor}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function PieBlock({
  title,
  data,
  color,
  height = 120,
  axisTick,
  footer,
}: {
  title: string;
  data: { name: string; value: number }[];
  color: string;
  height?: number;
  axisTick: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{title}</h3>
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={50}
              label={(e) => `${e.name} ${e.value.toFixed(0)}%`}
            >
              <Cell fill={color} />
              <Cell fill="#E5E7EB" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* 항상 보이는 간단 요약 */}
      {footer ? <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{footer}</div> : null}
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: strin}) {
  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SortMark({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="text-zinc-400 dark:text-zinc-500">↕</span>;
  return (
    <span className="text-zinc-900 dark:text-zinc-100">{dir === "as ? "▲" : "▼"}</span>
  );
}

