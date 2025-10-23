"use client";

import { useEffect, useState } from "react";
import { Shield, Eye, EyeOff, Database, Clock, Trash2, Save, LogOut, Lock, Moon, Sun, FileText, Plus, X, Bell, Webhook, History, Play, AlertTriangle } from "lucide-react";

interface VisibilitySettings {
  showProcessList: boolean;
  showCpuChart: boolean;
  showMemoryChart: boolean;
  showStorageChart: boolean;
  showTopProcesses: boolean;
  showDebugInfo: boolean;
}

interface CollectionSettings {
  intervalSeconds: number;
  memoryReadMode?: 'auto' | 'cgroup' | 'procfs';
}

interface LogFileConfig {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
}

interface LogSettings {
  files: LogFileConfig[];
  maxLines: number;
}

interface ThresholdSettings {
  cpu: number;
  memory: number;
  storage: number;
  enabled: boolean;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: 'POST' | 'GET' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body: string;
  enabled: boolean;
}

interface WebhookSettings {
  configs: WebhookConfig[];
}

interface AdminSettings {
  visibility: VisibilitySettings;
  collection: CollectionSettings;
  logs: LogSettings;
  thresholds: ThresholdSettings;
  webhooks: WebhookSettings;
}

interface WebhookHistoryEntry {
  id: string;
  timestamp: number;
  webhookName: string;
  webhookUrl: string;
  method: string;
  statusCode: number | null;
  success: boolean;
  error?: string;
  reason: string;
  responseTime: number;
}

interface MetricsInfo {
  count: number;
  estimatedSize: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [metricsInfo, setMetricsInfo] = useState<MetricsInfo | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [showWebhookHistory, setShowWebhookHistory] = useState(false);
  const [webhookHistory, setWebhookHistory] = useState<WebhookHistoryEntry[]>([]);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  // Theme management
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

  // Check if already authenticated
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      verifySession(token);
    }
  }, []);

  // Load settings and metrics info
  useEffect(() => {
    if (isAuthenticated) {
      loadSettings();
      loadMetricsInfo();
    }
  }, [isAuthenticated]);

  const verifySession = async (token: string) => {
    try {
      const res = await fetch("/api/admin/verify", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem("admin_token");
      }
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("admin_token", data.token);
        setIsAuthenticated(true);
        setPassword("");
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setIsAuthenticated(false);
  };

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Ensure logs field exists with default value
        if (!data.logs) {
          data.logs = { files: [], maxLines: 500 };
        }
        if (data.logs && data.logs.maxLines === undefined) {
          data.logs.maxLines = 500;
        }
        if (!data.thresholds) {
          data.thresholds = { cpu: 80, memory: 80, storage: 80, enabled: false };
        }
        if (!data.webhooks) {
          data.webhooks = { configs: [] };
        }
        // Ensure collection settings has memoryReadMode
        if (data.collection && !data.collection.memoryReadMode) {
          data.collection.memoryReadMode = 'auto';
        }
        setSettings(data);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const loadMetricsInfo = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/metrics-info", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMetricsInfo(data);
      }
    } catch (err) {
      console.error("Failed to load metrics info:", err);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaveMessage("Settings saved successfully!");
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setSaveMessage("Failed to save settings");
      }
    } catch {
      setSaveMessage("Failed to save settings");
    }
  };

  const handleClearCache = async () => {
    if (!confirm("Are you sure you want to clear all metrics data? This cannot be undone.")) {
      return;
    }

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/cache", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Cleared ${data.deletedCount} metrics records`);
        loadMetricsInfo();
      }
    } catch {
      alert("Failed to clear cache");
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    if (!settings) return;

    const webhook = settings.webhooks.configs.find(w => w.id === webhookId);
    if (!webhook) return;

    setTestingWebhook(webhookId);

    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/webhook/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(webhook),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          alert(`Webhook test successful!\nStatus: ${result.statusCode}\nResponse time: ${result.responseTime}ms`);
        } else {
          alert(`Webhook test failed!\n${result.error || `Status: ${result.statusCode}`}`);
        }
      } else {
        alert("Failed to test webhook");
      }
    } catch (error) {
      alert(`Error testing webhook: ${(error as Error).message}`);
    } finally {
      setTestingWebhook(null);
    }
  };

  const loadWebhookHistory = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/admin/webhook/history", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const history = await res.json();
        setWebhookHistory(history);
        setShowWebhookHistory(true);
      }
    } catch (error) {
      console.error("Failed to load webhook history:", error);
      alert("Failed to load webhook history");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const calculateProjection = (currentSize: number, count: number, intervalSec: number) => {
    if (count === 0 || intervalSec === 0) return { daily: 0, weekly: 0, monthly: 0 };

    const avgSizePerRecord = currentSize / count;
    const recordsPerSecond = 1 / intervalSec;

    const daily = avgSizePerRecord * recordsPerSecond * 86400;
    const weekly = daily * 7;
    const monthly = daily * 30;

    return { daily, weekly, monthly };
  };

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-black flex items-center justify-center p-4">
        {/* Theme toggle - absolute positioned */}
        <button
          onClick={() => setIsDark((v) => !v)}
          className="absolute top-4 right-4 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all"
          title="Toggle theme"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-4 rounded-full">
              <Shield className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-zinc-900 dark:text-zinc-100 mb-2">Admin Panel</h1>
          <p className="text-center text-zinc-600 dark:text-zinc-400 mb-6">Enter password to access admin settings</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Enter admin password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!settings || !metricsInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-black flex items-center justify-center">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  const projection = calculateProjection(
    metricsInfo.estimatedSize,
    metricsInfo.count,
    settings.collection.intervalSeconds
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-black text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/85 backdrop-blur-md dark:bg-zinc-900/85 dark:border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Shield className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-semibold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDark((v) => !v)}
              className="rounded-lg border px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all"
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {saveMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-lg mb-8">
            {saveMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8">
        {/* Visibility Settings */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-950/30 dark:to-cyan-950/30 px-8 py-5 border-b border-emerald-100/50 dark:border-emerald-900/50">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Visibility Settings</h2>
            </div>
          </div>

          <div className="p-8">
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(settings.visibility).map(([key, value]) => (
              <label key={key} className="flex items-center gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      visibility: { ...settings.visibility, [key]: e.target.checked },
                    })
                  }
                  className="w-5 h-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex items-center gap-2">
                  {value ? (
                    <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-zinc-400" />
                  )}
                  <span className="font-medium">
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())}
                  </span>
                </div>
              </label>
            ))}
          </div>
          </div>
        </section>

        {/* Collection Settings */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 overflow-hidden">
          <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30 px-8 py-5 border-b border-sky-100/50 dark:border-sky-900/50">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Collection Settings</h2>
            </div>
          </div>

          <div className="p-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Collection Interval (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="3600"
                value={settings.collection.intervalSeconds}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    collection: {
                      ...settings.collection,
                      intervalSeconds: parseInt(e.target.value) || 5
                    },
                  })
                }
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Current: Every {settings.collection.intervalSeconds} seconds
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Memory Read Mode
              </label>
              <select
                value={settings.collection.memoryReadMode || 'auto'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    collection: {
                      ...settings.collection,
                      memoryReadMode: e.target.value as 'auto' | 'cgroup' | 'procfs'
                    },
                  })
                }
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="auto">Auto (Detect automatically)</option>
                <option value="cgroup">cgroup (For containers)</option>
                <option value="procfs">/proc/meminfo (For VMs and bare metal)</option>
              </select>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Choose how to read memory usage. Use "procfs" mode for VMs and bare metal servers. Use "cgroup" for containers.
              </p>
            </div>
          </div>
          </div>
        </section>

        {/* Log Files Settings */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 px-8 py-5 border-b border-amber-100/50 dark:border-amber-900/50">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Log Files</h2>
            </div>
          </div>

          <div className="p-8">
          <div className="space-y-6">
            {/* Max Lines Setting */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Maximum Log Lines (per file)
              </label>
              <input
                type="number"
                min="50"
                max="10000"
                value={settings.logs?.maxLines ?? 500}
                onChange={(e) => {
                  if (!settings) return;
                  const maxLines = parseInt(e.target.value) || 500;
                  setSettings({
                    ...settings,
                    logs: { ...settings.logs, maxLines, files: settings.logs?.files || [] },
                  });
                }}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Maximum number of log lines to display per file in the log viewer (50-10000)
              </p>
            </div>

            {/* Log Files List */}
            <div className="space-y-4">
            {(settings.logs?.files || []).map((file, index) => (
              <div key={file.id} className="flex items-center gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={file.enabled}
                  onChange={(e) => {
                    if (!settings) return;
                    const newFiles = [...(settings.logs?.files || [])];
                    newFiles[index].enabled = e.target.checked;
                    setSettings({ ...settings, logs: { files: newFiles, maxLines: settings.logs?.maxLines || 500 } });
                  }}
                  className="w-5 h-5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1 grid md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={file.label}
                    onChange={(e) => {
                      if (!settings) return;
                      const newFiles = [...(settings.logs?.files || [])];
                      newFiles[index].label = e.target.value;
                      setSettings({ ...settings, logs: { files: newFiles, maxLines: settings.logs?.maxLines || 500 } });
                    }}
                    placeholder="Label (e.g., Application Log)"
                    className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                  <input
                    type="text"
                    value={file.path}
                    onChange={(e) => {
                      if (!settings) return;
                      const newFiles = [...(settings.logs?.files || [])];
                      newFiles[index].path = e.target.value;
                      setSettings({ ...settings, logs: { files: newFiles, maxLines: settings.logs?.maxLines || 500 } });
                    }}
                    placeholder="File path (e.g., /var/log/app.log)"
                    className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!settings) return;
                    const newFiles = (settings.logs?.files || []).filter((_, i) => i !== index);
                    setSettings({ ...settings, logs: { files: newFiles, maxLines: settings.logs?.maxLines || 500 } });
                  }}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                  title="Remove log file"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}

            <button
              onClick={() => {
                if (!settings) return;
                const newFile: LogFileConfig = {
                  id: `log-${Date.now()}`,
                  path: '',
                  label: '',
                  enabled: true,
                };
                const currentFiles = settings.logs?.files || [];
                setSettings({
                  ...settings,
                  logs: { files: [...currentFiles, newFile], maxLines: settings.logs?.maxLines || 500 },
                });
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-amber-500 dark:hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors w-full justify-center"
            >
              <Plus className="h-5 w-5" />
              Add Log File
            </button>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Add file paths to watch for log viewing. Files will be monitored for changes and displayed in the monitoring page.
            </p>
            </div>
          </div>
          </div>
        </section>

        {/* Threshold Settings */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 px-8 py-5 border-b border-orange-100/50 dark:border-orange-900/50">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Alert Thresholds</h2>
            </div>
          </div>

          <div className="p-8">
          <div className="space-y-6">
            {/* Enable/Disable Threshold Alerts */}
            <label className="flex items-center gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={settings.thresholds?.enabled ?? false}
                onChange={(e) => {
                  if (!settings) return;
                  setSettings({
                    ...settings,
                    thresholds: { ...settings.thresholds, enabled: e.target.checked },
                  });
                }}
                className="w-5 h-5 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
              />
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="font-medium">Enable Threshold Alerts</span>
              </div>
            </label>

            {/* Threshold Values */}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">CPU Threshold (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.thresholds?.cpu ?? 80}
                  onChange={(e) => {
                    if (!settings) return;
                    setSettings({
                      ...settings,
                      thresholds: { ...settings.thresholds, cpu: parseInt(e.target.value) || 80 },
                    });
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Memory Threshold (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.thresholds?.memory ?? 80}
                  onChange={(e) => {
                    if (!settings) return;
                    setSettings({
                      ...settings,
                      thresholds: { ...settings.thresholds, memory: parseInt(e.target.value) || 80 },
                    });
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Storage Threshold (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.thresholds?.storage ?? 80}
                  onChange={(e) => {
                    if (!settings) return;
                    setSettings({
                      ...settings,
                      thresholds: { ...settings.thresholds, storage: parseInt(e.target.value) || 80 },
                    });
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Webhook notifications will be sent when resource usage exceeds these thresholds. Alerts have a 5-minute cooldown period.
            </p>
          </div>
          </div>
        </section>

        {/* Webhook Settings */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 px-8 py-5 border-b border-indigo-100/50 dark:border-indigo-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Webhook className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Webhooks</h2>
              </div>
              <button
                onClick={loadWebhookHistory}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors text-sm text-indigo-700 dark:text-indigo-300"
              >
                <History className="h-4 w-4" />
                View History
              </button>
            </div>
          </div>

          <div className="p-8">
          <div className="space-y-4">
            {(settings.webhooks?.configs || []).map((webhook, index) => (
              <details key={webhook.id} className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer select-none flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={webhook.enabled}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (!settings) return;
                        const newConfigs = [...(settings.webhooks?.configs || [])];
                        newConfigs[index].enabled = e.target.checked;
                        setSettings({ ...settings, webhooks: { configs: newConfigs } });
                      }}
                      className="w-5 h-5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium">{webhook.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{webhook.url}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestWebhook(webhook.id);
                      }}
                      disabled={testingWebhook === webhook.id}
                      className="px-3 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-xs flex items-center gap-1"
                    >
                      <Play className="h-3 w-3" />
                      {testingWebhook === webhook.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!settings) return;
                        const newConfigs = (settings.webhooks?.configs || []).filter((_, i) => i !== index);
                        setSettings({ ...settings, webhooks: { configs: newConfigs } });
                      }}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </summary>

                <div className="mt-4 space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    Use template variables: {'{{timestamp}}'}, {'{{alert}}'}, {'{{resource}}'}, {'{{currentValue}}'}, {'{{threshold}}'}, {'{{message}}'}
                  </p>
                  <input
                    type="text"
                    value={webhook.name}
                    onChange={(e) => {
                      if (!settings) return;
                      const newConfigs = [...(settings.webhooks?.configs || [])];
                      newConfigs[index].name = e.target.value;
                      setSettings({ ...settings, webhooks: { configs: newConfigs } });
                    }}
                    placeholder="Webhook Name"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
                  />
                  <input
                    type="url"
                    value={webhook.url}
                    onChange={(e) => {
                      if (!settings) return;
                      const newConfigs = [...(settings.webhooks?.configs || [])];
                      newConfigs[index].url = e.target.value;
                      setSettings({ ...settings, webhooks: { configs: newConfigs } });
                    }}
                    placeholder="https://example.com/webhook"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
                  />
                  <select
                    value={webhook.method}
                    onChange={(e) => {
                      if (!settings) return;
                      const newConfigs = [...(settings.webhooks?.configs || [])];
                      newConfigs[index].method = e.target.value as any;
                      setSettings({ ...settings, webhooks: { configs: newConfigs } });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                  <textarea
                    value={webhook.body}
                    onChange={(e) => {
                      if (!settings) return;
                      const newConfigs = [...(settings.webhooks?.configs || [])];
                      newConfigs[index].body = e.target.value;
                      setSettings({ ...settings, webhooks: { configs: newConfigs } });
                    }}
                    placeholder='{"text": "{{message}}"}'
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
                  />

                  {/* Headers Configuration */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Headers</label>
                    {Object.entries(webhook.headers).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <input
                          type="text"
                          value={key}
                          onChange={(e) => {
                            if (!settings) return;
                            const newConfigs = [...(settings.webhooks?.configs || [])];
                            const newHeaders = { ...newConfigs[index].headers };
                            delete newHeaders[key];
                            if (e.target.value) {
                              newHeaders[e.target.value] = value;
                            }
                            newConfigs[index].headers = newHeaders;
                            setSettings({ ...settings, webhooks: { configs: newConfigs } });
                          }}
                          placeholder="Header Name (e.g., Authorization, X-API-Key)"
                          className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
                        />
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => {
                            if (!settings) return;
                            const newConfigs = [...(settings.webhooks?.configs || [])];
                            newConfigs[index].headers[key] = e.target.value;
                            setSettings({ ...settings, webhooks: { configs: newConfigs } });
                          }}
                          placeholder="Header Value (e.g., Bearer token123)"
                          className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
                        />
                        <button
                          onClick={() => {
                            if (!settings) return;
                            const newConfigs = [...(settings.webhooks?.configs || [])];
                            const newHeaders = { ...newConfigs[index].headers };
                            delete newHeaders[key];
                            newConfigs[index].headers = newHeaders;
                            setSettings({ ...settings, webhooks: { configs: newConfigs } });
                          }}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
                          title="Remove header"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        if (!settings) return;
                        const newConfigs = [...(settings.webhooks?.configs || [])];
                        const newHeaders = { ...newConfigs[index].headers };
                        const newKey = `Header-${Date.now()}`;
                        newHeaders[newKey] = '';
                        newConfigs[index].headers = newHeaders;
                        setSettings({ ...settings, webhooks: { configs: newConfigs } });
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-600 dark:text-zinc-400"
                    >
                      <Plus className="h-4 w-4" />
                      Add Header
                    </button>
                  </div>
                </div>
              </details>
            ))}

            <button
              onClick={() => {
                if (!settings) return;
                const newWebhook: WebhookConfig = {
                  id: `webhook-${Date.now()}`,
                  name: '',
                  url: '',
                  method: 'POST',
                  headers: {},
                  body: '{"text": "{{message}}"}',
                  enabled: true,
                };
                setSettings({
                  ...settings,
                  webhooks: { configs: [...(settings.webhooks?.configs || []), newWebhook] },
                });
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors w-full justify-center"
            >
              <Plus className="h-5 w-5" />
              Add Webhook
            </button>
          </div>
          </div>
        </section>

        {/* Metrics Information */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow dark:shadow-none ring-1 ring-zinc-200/70 dark:ring-zinc-700/60 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 px-8 py-5 border-b border-violet-100/50 dark:border-violet-900/50">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Metrics Storage</h2>
            </div>
          </div>

          <div className="p-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Records</div>
              <div className="text-2xl font-bold">{metricsInfo.count.toLocaleString()}</div>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Current Size</div>
              <div className="text-2xl font-bold">{formatBytes(metricsInfo.estimatedSize)}</div>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Time Range</div>
              <div className="text-lg font-bold">
                {metricsInfo.count > 0
                  ? `${Math.round((metricsInfo.newestTimestamp - metricsInfo.oldestTimestamp) / 60000)} min`
                  : "N/A"}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Avg Size/Record</div>
              <div className="text-lg font-bold">
                {metricsInfo.count > 0
                  ? formatBytes(Math.round(metricsInfo.estimatedSize / metricsInfo.count))
                  : "N/A"}
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
            <h3 className="font-semibold mb-4">Storage Projection</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Daily</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatBytes(projection.daily)}
                </div>
              </div>

              <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Weekly</div>
                <div className="text-xl font-bold text-sky-600 dark:text-sky-400">
                  {formatBytes(projection.weekly)}
                </div>
              </div>

              <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Monthly</div>
                <div className="text-xl font-bold text-violet-600 dark:text-violet-400">
                  {formatBytes(projection.monthly)}
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4">
              * Projection based on current collection interval ({settings.collection.intervalSeconds}s)
              and average record size
            </p>
          </div>
          </div>
        </section>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={handleSaveSettings}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-medium rounded-lg transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <Save className="h-5 w-5" />
            Save Settings
          </button>

          <button
            onClick={handleClearCache}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white font-medium rounded-lg transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <Trash2 className="h-5 w-5" />
            Clear All Metrics
          </button>
        </div>
      </div>

      {/* Webhook History Dialog */}
      {showWebhookHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowWebhookHistory(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden ring-1 ring-zinc-200 dark:ring-zinc-800" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 px-8 py-5 border-b border-indigo-100/50 dark:border-indigo-900/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">Webhook History</h3>
              </div>
              <button
                onClick={() => setShowWebhookHistory(false)}
                className="p-2 hover:bg-white/50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-8rem)]">
              {webhookHistory.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                  No webhook history found
                </div>
              ) : (
                <div className="space-y-3">
                  {webhookHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-4 rounded-lg border ${
                        entry.success
                          ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20'
                          : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-sm">{entry.webhookName}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              entry.success
                                ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            }`}>
                              {entry.success ? 'Success' : 'Failed'}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              {entry.method}
                            </span>
                            {entry.statusCode && (
                              <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                {entry.statusCode}
                              </span>
                            )}
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {entry.responseTime}ms
                            </span>
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1 truncate">
                            {entry.webhookUrl}
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                            {entry.reason}
                          </div>
                          {entry.error && (
                            <div className="text-xs text-red-600 dark:text-red-400 font-mono">
                              Error: {entry.error}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
