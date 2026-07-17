"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-provider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { syncService } from "@/services/syncService";
import { localDB } from "@/services/db";
import {
  Camera,
  LayoutDashboard,
  GraduationCap,
  Users,
  LogOut,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
} from "lucide-react";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, isDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isOnline = useOnlineStatus();
  const pathname = usePathname();
  const router = useRouter();

  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Refresh unsynced count periodically
  const refreshUnsynced = async () => {
    try {
      const records = await localDB.getUnsyncedRecords();
      const sessions = await localDB.getUnsyncedSessions();
      setUnsyncedCount(records.length + sessions.length);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (user) {
      refreshUnsynced();
      const interval = setInterval(refreshUnsynced, 5000); // Check every 5s
      return () => clearInterval(interval);
    }
  }, [user]);

  // Automatic sync listener
  useEffect(() => {
    if (user) {
      const unsubscribe = syncService.initSyncListener(async (sessions, records) => {
        console.log(`Synced ${sessions} sessions and ${records} records.`);
        await refreshUnsynced();
      });
      return unsubscribe;
    }
  }, [user]);

  // Pull Cloud Data on mount when logged in to a real account
  useEffect(() => {
    if (user && !isDemoMode && isOnline) {
      console.log("Pulling active cloud data from Firestore...");
      syncService.pullCloudData()
        .then(() => refreshUnsynced())
        .catch(console.error);
    }
  }, [user, isDemoMode, isOnline]);

  const handleSync = async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      await syncService.syncOfflineData();
      await refreshUnsynced();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground font-sans">Loading Console...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/classes", label: "Classes", icon: GraduationCap },
    { href: "/students", label: "Students", icon: Users },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card">
        {/* Logo Section */}
        <div className="flex h-16 items-center px-6 gap-2 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Camera className="h-4 w-4" />
          </div>
          <span className="font-bold text-lg tracking-tight">VeriFace</span>
          {isDemoMode && (
            <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
              Demo
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area with Sync, Theme, and Profile */}
        <div className="p-4 border-t border-border space-y-4 bg-muted/20">
          {/* Connection / Sync indicator */}
          <div className="flex items-center justify-between text-xs px-2">
            <div className="flex items-center gap-1.5 font-medium">
              {isOnline ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-green-600 dark:text-green-400">Online</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-600 dark:text-amber-400">Offline Mode</span>
                </>
              )}
            </div>
            {unsyncedCount > 0 && (
              <button
                onClick={handleSync}
                disabled={isSyncing || !isOnline}
                className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
              >
                {isSyncing ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Sync ({unsyncedCount})
              </button>
            )}
          </div>

          {/* Controls & Profile */}
          <div className="flex items-center justify-between border-t border-border pt-4 px-2">
            <div className="flex flex-col max-w-[140px]">
              <span className="text-xs font-semibold truncate">
                {user.user_metadata?.name || "Teacher"}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Toggle Theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded hover:bg-muted text-red-500 hover:bg-red-500/10"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Mobile Nav */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Camera className="h-4 w-4" />
            </div>
            <span className="font-bold text-lg tracking-tight">VeriFace</span>
            {isDemoMode && (
              <span className="rounded bg-yellow-500/10 px-1 py-0.5 text-[8px] font-medium text-yellow-600 dark:text-yellow-400">
                Demo
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {unsyncedCount > 0 && isOnline && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="text-xs text-primary flex items-center gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                ({unsyncedCount})
              </button>
            )}
            
            <nav className="flex gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`p-2 rounded ${
                      isActive ? "bg-secondary text-foreground" : "text-muted-foreground"
                    }`}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="p-2 rounded text-red-500"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </header>

        {/* Viewport content */}
        <main className="flex-1 overflow-y-auto bg-background p-6 md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
