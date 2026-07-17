"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { localDB, LocalClass, LocalRecord, LocalSession, LocalStudent } from "@/services/db";
import { db as firestoreDb } from "@/lib/firebase";
import { doc } from "firebase/firestore";
import {
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  Check,
} from "lucide-react";

interface DisplayRecord {
  record: LocalRecord;
  student: LocalStudent;
}

export default function AttendanceReviewPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [session, setSession] = useState<LocalSession | null>(null);
  const [activeClass, setActiveClass] = useState<LocalClass | null>(null);
  const [displayRecords, setDisplayRecords] = useState<DisplayRecord[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load session records
  useEffect(() => {
    async function loadSessionData() {
      if (!sessionId) {
        setErrorMsg("Session ID missing.");
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        
        // 1. Get session info
        const sessions = await localDB.getSessions();
        const foundSession = sessions.find((s) => s.id === sessionId);
        if (!foundSession) {
          setErrorMsg("Attendance session not found.");
          setIsLoading(false);
          return;
        }
        setSession(foundSession);

        // 2. Get class info
        const cls = await localDB.getClass(foundSession.class_id);
        setActiveClass(cls || null);

        // 3. Get records
        const records = await localDB.getRecordsBySession(sessionId);
        
        // Get all students of this class to match
        const students = await localDB.getStudentsByClass(foundSession.class_id);

        const list: DisplayRecord[] = [];
        for (const r of records) {
          const s = students.find((stud) => stud.id === r.student_id);
          if (s) {
            list.push({ record: r, student: s });
          }
        }

        // Sort by roll number numerically
        list.sort((a, b) =>
          a.student.roll_number.localeCompare(b.student.roll_number, undefined, { numeric: true })
        );

        setDisplayRecords(list);
        setErrorMsg(null);
      } catch (e) {
        console.error(e);
        setErrorMsg("Failed to load session details.");
      } finally {
        setIsLoading(false);
      }
    }

    loadSessionData();
  }, [sessionId]);

  // Handle local status changes
  const handleStatusChange = (studentId: string, newStatus: LocalRecord["status"]) => {
    setDisplayRecords((prev) =>
      prev.map((item) => {
        if (item.student.id === studentId) {
          const isMarkedPresent = newStatus === "present" || newStatus === "late";
          return {
            ...item,
            record: {
              ...item.record,
              status: newStatus,
              arrival_time: isMarkedPresent
                ? item.record.arrival_time || new Date().toISOString()
                : null,
              confidence: item.record.confidence > 0 ? item.record.confidence : 1.0, // Force 1.0 for manual edits
            },
          };
        }
        return item;
      })
    );
  };

  // Submit all reviews
  const handleSubmitReviews = async () => {
    if (!session) return;
    setIsSaving(true);
    setErrorMsg(null);

    const recordsToSave = displayRecords.map((item) => item.record);

    try {
      // 1. Save in local IndexedDB
      await localDB.saveRecords(recordsToSave);

      // 2. Upload to Firestore if online
      if (isOnline && user?.id !== "demo-teacher-uuid") {
        const { writeBatch } = await import("firebase/firestore");
        const batch = writeBatch(firestoreDb);

        // Set session doc
        const sessionRef = doc(firestoreDb, "attendance_sessions", session.id);
        batch.set(sessionRef, {
          id: session.id,
          class_id: session.class_id,
          teacher_id: session.teacher_id,
          date: session.date,
          created_at: session.created_at,
        });

        // Set records docs
        recordsToSave.forEach((r) => {
          const recordRef = doc(firestoreDb, "attendance_records", r.id);
          batch.set(recordRef, {
            id: r.id,
            session_id: r.session_id,
            student_id: r.student_id,
            status: r.status,
            arrival_time: r.arrival_time,
            confidence: r.confidence,
            created_at: r.created_at,
          });
        });

        await batch.commit();

        // Mark session as synced locally
        await localDB.saveSession({ ...session, synced: true });
        
        // Mark records as synced locally
        const syncedRecords: LocalRecord[] = recordsToSave.map((r) => ({ ...r, synced: true }));
        await localDB.saveRecords(syncedRecords);
      }

      alert("Attendance session saved and submitted successfully!");
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to upload attendance records. Records are saved locally and will auto-sync later.");
      setIsSaving(false);
      
      // Navigate back anyway since files are saved locally
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (errorMsg && !session) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 p-8 border border-border rounded-xl bg-card">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold font-sans">Error</h2>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4 gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight font-sans">
              Review Attendance Sheet
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Batch: {activeClass?.name} | Date:{" "}
              {session &&
                new Date(session.date).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
            </p>
          </div>
        </div>

        <button
          onClick={handleSubmitReviews}
          disabled={isSaving}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Submit Attendance
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4 text-xs text-yellow-600 dark:text-yellow-400 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Roster Review Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        {displayRecords.length > 0 ? (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 font-medium text-muted-foreground">
                <th className="p-4 w-20">Roll</th>
                <th className="p-4">Student</th>
                <th className="p-4 w-44">Status</th>
                <th className="p-4 w-32">Confidence</th>
                <th className="p-4 w-36">Arrival Time</th>
              </tr>
            </thead>
            <tbody>
              {displayRecords.map(({ record, student }) => {
                const confidencePercent = Math.round(record.confidence * 100);
                const arrivalTimeStr = record.arrival_time
                  ? new Date(record.arrival_time).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-";

                return (
                  <tr key={student.id} className="border-b border-border last:border-0 hover:bg-muted/5">
                    <td className="p-4 font-semibold font-mono">{student.roll_number}</td>
                    <td className="p-4">
                      <div className="font-semibold">{student.name}</div>
                      {student.parent_contact && (
                        <div className="text-[10px] text-muted-foreground">{student.parent_contact}</div>
                      )}
                    </td>
                    <td className="p-4">
                      <select
                        value={record.status}
                        onChange={(e) =>
                          handleStatusChange(student.id, e.target.value as any)
                        }
                        className={`rounded-md border bg-background px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                          record.status === "present"
                            ? "border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/5"
                            : record.status === "absent"
                            ? "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5"
                            : record.status === "late"
                            ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-500/5"
                            : "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5"
                        }`}
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="excused">Excused</option>
                      </select>
                    </td>
                    <td className="p-4">
                      {record.status === "absent" || record.status === "excused" ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : record.confidence === 1.0 ? (
                        <span className="text-xs text-muted-foreground italic flex items-center gap-0.5">
                          <Check className="h-3.5 w-3.5 text-blue-500" /> Manual
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-semibold">
                          {confidencePercent}% match
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-xs text-muted-foreground">
                      {arrivalTimeStr}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            <span className="text-sm block">No student roster records found for this class.</span>
          </div>
        )}
      </div>
    </div>
  );
}
