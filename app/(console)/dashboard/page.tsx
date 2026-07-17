"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localDB, LocalClass, LocalSession, LocalRecord } from "@/services/db";
import { useAuth } from "@/contexts/auth-context";
import {
  Users,
  GraduationCap,
  Percent,
  Clock,
  Play,
  UserPlus,
  ArrowUpRight,
  TrendingUp,
  FileCheck,
  CalendarDays,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface Stats {
  totalClasses: number;
  totalStudents: number;
  overallAttendanceRate: number;
  lateTodayCount: number;
}

interface ChartDataPoint {
  date: string;
  rate: number;
}

interface RecentActivity {
  sessionId: string;
  className: string;
  date: string;
  presentCount: number;
  totalCount: number;
  rate: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalClasses: 0,
    totalStudents: 0,
    overallAttendanceRate: 0,
    lateTodayCount: 0,
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [classesList, setClassesList] = useState<LocalClass[]>([]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch classes, students, sessions, records
      const classes = await localDB.getClasses();
      setClassesList(classes);
      
      const sessions = await localDB.getSessions();
      
      let totalStudentsCount = 0;
      for (const c of classes) {
        const studentsInClass = await localDB.getStudentsByClass(c.id);
        totalStudentsCount += studentsInClass.length;
      }

      // Calculate attendance stats
      let totalPresentOrLate = 0;
      let totalRecordsCount = 0;
      let lateToday = 0;

      const todayStr = new Date().toISOString().split("T")[0];
      const recentActs: RecentActivity[] = [];

      // Sort sessions by date descending
      const sortedSessions = [...sessions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      for (const session of sortedSessions) {
        const records = await localDB.getRecordsBySession(session.id);
        const cls = classes.find((c) => c.id === session.class_id);
        const className = cls ? cls.name : "Unknown Class";

        const presentOrLate = records.filter(
          (r) => r.status === "present" || r.status === "late"
        ).length;
        
        totalPresentOrLate += presentOrLate;
        totalRecordsCount += records.length;

        // Today's late count
        if (session.date === todayStr) {
          lateToday += records.filter((r) => r.status === "late").length;
        }

        const rate = records.length > 0 ? Math.round((presentOrLate / records.length) * 100) : 0;

        if (recentActs.length < 5) {
          recentActs.push({
            sessionId: session.id,
            className,
            date: new Date(session.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            presentCount: presentOrLate,
            totalCount: records.length,
            rate,
          });
        }
      }

      setRecentActivities(recentActs);

      const overallRate =
        totalRecordsCount > 0 ? Math.round((totalPresentOrLate / totalRecordsCount) * 100) : 0;

      setStats({
        totalClasses: classes.length,
        totalStudents: totalStudentsCount,
        overallAttendanceRate: overallRate,
        lateTodayCount: lateToday,
      });

      // Prepare chart data (reverse sorted sessions for chronological chart)
      const chronologicalSessions = [...sessions]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-7); // Last 7 sessions

      const cData: ChartDataPoint[] = [];
      for (const s of chronologicalSessions) {
        const records = await localDB.getRecordsBySession(s.id);
        const presentOrLate = records.filter(
          (r) => r.status === "present" || r.status === "late"
        ).length;
        const rate = records.length > 0 ? Math.round((presentOrLate / records.length) * 100) : 0;
        
        // Format date to e.g. "Jul 9"
        const formattedDate = new Date(s.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

        cData.push({
          date: formattedDate,
          rate,
        });
      }
      setChartData(cData);

    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-sans">
            Welcome back, {user?.user_metadata?.name || "Teacher"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's a summary of your class attendance logs.
          </p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button
            onClick={() => router.push("/classes")}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Start Attendance
          </button>
        </div>
      </div>

      {/* Grid of Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Classes</span>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-bold tracking-tight">{stats.totalClasses}</span>
            <span className="text-[10px] text-muted-foreground">active batches</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Students</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-bold tracking-tight">{stats.totalStudents}</span>
            <span className="text-[10px] text-muted-foreground">biometrics enrolled</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Avg. Attendance</span>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-bold tracking-tight">
              {stats.overallAttendanceRate}%
            </span>
            <span className="text-[10px] text-green-500 font-semibold flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" />
              Healthy
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium text-muted-foreground">Late Today</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-bold tracking-tight">{stats.lateTodayCount}</span>
            <span className="text-[10px] text-muted-foreground">requires check-in</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Charts & Recents */}
      <div className="grid gap-6 md:grid-cols-6 lg:grid-cols-7">
        {/* Chart View */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm md:col-span-4">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              <h3 className="font-bold text-lg font-sans">Attendance Analytics</h3>
              <p className="text-xs text-muted-foreground">Historical rates for the last 7 sessions</p>
            </div>
          </div>
          <div className="h-80 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRate)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-lg">
                <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
                <span className="font-bold text-sm">No historical logs</span>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Take attendance in a class to view metrics and analytics.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Session Log */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm md:col-span-2 lg:col-span-3 flex flex-col">
          <div className="mb-6">
            <h3 className="font-bold text-lg font-sans">Recent Sessions</h3>
            <p className="text-xs text-muted-foreground">Most recent attendance sync logs</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto">
            {recentActivities.length > 0 ? (
              recentActivities.map((act) => (
                <div
                  key={act.sessionId}
                  onClick={() => router.push(`/attendance/review?session=${act.sessionId}`)}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 cursor-pointer transition-all"
                >
                  <div className="space-y-1">
                    <span className="font-bold text-sm block tracking-tight truncate max-w-[150px]">
                      {act.className}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">{act.date}</span>
                  </div>
                  
                  <div className="text-right space-y-1">
                    <span className="font-bold text-sm block">{act.rate}%</span>
                    <span className="text-[10px] text-muted-foreground block">
                      {act.presentCount}/{act.totalCount} present
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-lg">
                <FileCheck className="h-10 w-10 text-muted-foreground mb-3" />
                <span className="font-bold text-sm">No recent activity</span>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  All completed scanning sessions will show up here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      {classesList.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card max-w-lg mx-auto">
          <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold tracking-tight font-sans">Create Your First Class</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            To start taking biometric attendance, create a class (e.g. Grade 12 - Science) and register student profiles.
          </p>
          <button
            onClick={() => router.push("/classes")}
            className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Go to Classes Setup
          </button>
        </div>
      )}
    </div>
  );
}
