"use client";

import Link from "next/link";
import { Cpu, Shield, Activity, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-zinc-950 dark:to-black">
      {/* Theme toggle - absolute positioned */}
      <button
        onClick={() => setIsDark((v) => !v)}
        className="absolute top-4 right-4 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 transition-all text-zinc-900 dark:text-zinc-100"
        title="Toggle theme"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="flex min-h-screen items-center justify-center px-4">
        <main className="w-full max-w-4xl">
          <div className="text-center space-y-8">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                <div className="relative bg-white dark:bg-zinc-900 rounded-full p-6 shadow-xl ring-1 ring-zinc-200 dark:ring-zinc-800">
                  <Activity className="h-16 w-16 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 dark:from-zinc-100 dark:via-zinc-400 dark:to-zinc-100 bg-clip-text text-transparent">
                Container Ops
              </h1>
              <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                Real-time system monitoring for containerized environments
              </p>
            </div>

            {/* Features */}
            <div className="grid md:grid-cols-3 gap-6 pt-8 max-w-3xl mx-auto">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-4 mx-auto">
                  <Cpu className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Real-time Metrics</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Monitor CPU, memory, and storage usage in real-time</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/30 mb-4 mx-auto">
                  <Activity className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Process Tracking</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Track individual processes with detailed metrics</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-4 mx-auto">
                  <Shield className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Admin Control</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Manage visibility and metrics collection settings</p>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Link
                href="/monitoring"
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
              >
                View Dashboard
              </Link>
              <Link
                href="/admin"
                className="px-8 py-4 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold rounded-xl shadow-lg hover:shadow-xl ring-1 ring-zinc-200 dark:ring-zinc-800 transition-all hover:-translate-y-0.5"
              >
                Admin Panel
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
