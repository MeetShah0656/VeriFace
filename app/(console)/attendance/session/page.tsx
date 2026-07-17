"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useFaceRecognition, MatchSuccessResult } from "@/hooks/useFaceRecognition";
import { localDB, LocalClass, LocalRecord, LocalSession, LocalStudent } from "@/services/db";
import {
  Camera,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  Award,
} from "lucide-react";
import confetti from "canvas-confetti";

export default function AttendanceSessionPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = searchParams.get("class");

  const [activeClass, setActiveClass] = useState<LocalClass | null>(null);
  const [classStudents, setClassStudents] = useState<LocalStudent[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Video feed and Canvas references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Scanning Session State
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [scannedRecords, setScannedRecords] = useState<{ [studentId: string]: LocalRecord }>({});
  const [lastScannedStudent, setLastScannedStudent] = useState<{
    student: LocalStudent;
    confidence: number;
    isDuplicate: boolean;
  } | null>(null);

  // Hook into our face recognition pipeline
  const {
    isLoadingModels,
    loadProgress,
    activeStatus,
    qualityFeedback,
    startRecognition,
    stopRecognition,
    studentsCount,
  } = useFaceRecognition(classId, { threshold: 0.65, detectionIntervalMs: 250 });

  // 1. Initial Load: Fetch Class details
  useEffect(() => {
    async function loadClass() {
      if (!classId) {
        setErrorMsg("No class selected.");
        return;
      }
      try {
        const cls = await localDB.getClass(classId);
        if (!cls) {
          setErrorMsg("Class batch not found.");
          return;
        }
        setActiveClass(cls);

        const students = await localDB.getStudentsByClass(classId);
        setClassStudents(students);

        // Pre-create an active session ID for this attendance block
        setActiveSessionId(crypto.randomUUID());
      } catch (e) {
        console.error(e);
        setErrorMsg("Failed to load class details.");
      }
    }
    loadClass();
  }, [classId]);

  // 2. Start Video Feed
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      setErrorMsg(null);
    } catch (e) {
      console.error(e);
      setErrorMsg("Unable to access camera. Please check camera permissions.");
    }
  };

  // 3. Stop Video Feed
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
    stopRecognition();
  };

  // Start face recognition loop once camera is active
  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const hidden = hiddenCanvasRef.current;

    if (isCameraActive && video && overlay && hidden && !isLoadingModels) {
      startRecognition(video, overlay, hidden, handleFaceMatched);
    }

    return () => {
      stopRecognition();
    };
  }, [isCameraActive, isLoadingModels, startRecognition, stopRecognition]);

  // 4. Handle Face Recognition Match Event
  const handleFaceMatched = (result: MatchSuccessResult) => {
    const { student, similarity } = result;

    setScannedRecords((prev) => {
      const existing = prev[student.id];

      if (existing) {
        // Already marked present in this session, show duplicate warning
        setLastScannedStudent({
          student,
          confidence: similarity,
          isDuplicate: true,
        });
        return prev;
      }

      // Create new attendance record
      const record: LocalRecord = {
        id: crypto.randomUUID(),
        session_id: activeSessionId,
        student_id: student.id,
        status: "present",
        arrival_time: new Date().toISOString(),
        confidence: similarity,
        created_at: new Date().toISOString(),
        synced: false,
      };

      // Play chime
      playSuccessChime();

      // Trigger Confetti Celebration (small burst)
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });

      // Update UI cards
      setLastScannedStudent({
        student,
        confidence: similarity,
        isDuplicate: false,
      });

      return {
        ...prev,
        [student.id]: record,
      };
    });
  };

  // Play double note chime
  const playSuccessChime = () => {
    if (typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Note 1 (C5)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.15);

      // Note 2 (E5)
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.25);
      }, 90);
    } catch (e) {
      console.warn("Chime playback failed", e);
    }
  };

  // 5. Complete Session & Redirect to Review Sheet
  const handleFinishSession = async () => {
    stopCamera();

    if (Object.keys(scannedRecords).length === 0) {
      const confirmEmpty = window.confirm(
        "No student faces were scanned. Are you sure you want to finish this session?"
      );
      if (!confirmEmpty) return;
    }

    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const sessionObj: LocalSession = {
        id: activeSessionId,
        class_id: classId!,
        teacher_id: user?.id || "demo-teacher-uuid",
        date: todayStr,
        created_at: new Date().toISOString(),
        synced: false,
      };

      // Store session and records temporarily in IndexedDB
      await localDB.saveSession(sessionObj);
      
      const recordsToSave = Object.values(scannedRecords);
      
      // Auto-populate remaining class students as "absent" in the local cache
      const absentStudents = classStudents.filter((s) => !scannedRecords[s.id]);
      const absentRecords: LocalRecord[] = absentStudents.map((student) => ({
        id: crypto.randomUUID(),
        session_id: activeSessionId,
        student_id: student.id,
        status: "absent",
        arrival_time: null,
        confidence: 0,
        created_at: new Date().toISOString(),
        synced: false,
      }));

      await localDB.saveRecords([...recordsToSave, ...absentRecords]);

      // Route to review sheet
      router.push(`/attendance/review?session=${activeSessionId}`);
    } catch (e) {
      console.error(e);
      alert("Failed to save attendance session.");
    }
  };

  // Clear card display helper
  useEffect(() => {
    if (lastScannedStudent) {
      const timer = setTimeout(() => {
        setLastScannedStudent(null);
      }, 3500); // Remove success popover after 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [lastScannedStudent]);

  if (errorMsg && !isCameraActive) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 p-8 border border-border rounded-xl bg-card">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold font-sans">Error</h2>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <button
          onClick={() => router.push("/classes")}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Classes
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border pb-4 gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              stopCamera();
              router.push("/classes");
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight font-sans">
              Scan: {activeClass?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Students present: {Object.keys(scannedRecords).length} / {classStudents.length}
            </p>
          </div>
        </div>

        <button
          onClick={handleFinishSession}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Finish Session
        </button>
      </div>

      {/* Main Grid: Camera Viewport vs Successful Scan Popovers */}
      <div className="grid md:grid-cols-5 gap-8 items-center">
        {/* Camera block (Col 3) */}
        <div className="md:col-span-3 flex flex-col items-center gap-4">
          <div className="relative w-full aspect-[4/3] max-w-[480px] bg-black rounded-2xl overflow-hidden border border-border group shadow-sm">
            {/* Guide Circle overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-[200px] h-[200px] rounded-full border-4 border-dashed border-white" />
            </div>

            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              playsInline
              muted
            />

            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full z-20 scale-x-[-1]"
            />

            {/* Hidden canvas for face crop extraction */}
            <canvas ref={hiddenCanvasRef} width={112} height={112} className="hidden" />

            {!isCameraActive && (
              <div className="absolute inset-0 z-30 bg-card/90 flex flex-col items-center justify-center p-6 text-center gap-4">
                <Camera className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm">Real-Time Face Scanner</h3>
                  {studentsCount === 0 ? (
                    <p className="text-xs text-red-500 max-w-[240px] mx-auto font-semibold">
                      Warning: No face biometrics are enrolled for this class! Register student faces first.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                      Have students approach the camera one at a time. The scanner marks them present instantly.
                    </p>
                  )}
                </div>
                <button
                  onClick={startCamera}
                  disabled={studentsCount === 0}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Open Scanner Feed
                </button>
              </div>
            )}

            {/* Model Loading State overlay */}
            {isCameraActive && isLoadingModels && (
              <div className="absolute inset-0 z-40 bg-card/90 flex flex-col items-center justify-center p-6 text-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm">Loading AI Biometrics...</h3>
                  <p className="text-xs text-muted-foreground">Preparing models: {loadProgress}%</p>
                </div>
              </div>
            )}
          </div>

          {/* Status feedback bar */}
          {isCameraActive && !isLoadingModels && (
            <div
              className={`w-full max-w-[480px] p-3 rounded-xl border text-center text-xs font-semibold flex items-center justify-center gap-2 ${
                qualityFeedback === "Processing..."
                  ? "bg-primary/10 border-primary/20 text-primary animate-pulse"
                  : qualityFeedback?.includes("Match")
                  ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
                  : qualityFeedback === "Unknown face"
                  ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                  : "bg-muted/30 border-border text-muted-foreground"
              }`}
            >
              <span className="font-mono uppercase tracking-wider">{activeStatus}</span>
              {qualityFeedback && (
                <>
                  <span className="text-border">|</span>
                  <span className="font-sans">{qualityFeedback}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Scan popup display panel (Col 2) */}
        <div className="md:col-span-2 min-h-[160px] flex flex-col justify-center">
          {lastScannedStudent ? (
            <div
              className={`rounded-xl border p-6 text-center space-y-4 shadow-sm animate-in fade-in zoom-in-95 duration-200 ${
                lastScannedStudent.isDuplicate
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
              }`}
            >
              <div className="mx-auto h-12 w-12 rounded-full flex items-center justify-center bg-card shadow-sm border border-border">
                {lastScannedStudent.isDuplicate ? (
                  <Check className="h-6 w-6 text-amber-500" />
                ) : (
                  <Award className="h-6 w-6 text-green-500" />
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs uppercase font-bold tracking-wide">
                  {lastScannedStudent.isDuplicate ? "Already Present" : "Marked Present"}
                </span>
                <h3 className="text-xl font-bold font-sans">
                  {lastScannedStudent.student.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Roll Number: {lastScannedStudent.student.roll_number} | Match:{" "}
                  {Math.round(lastScannedStudent.confidence * 100)}%
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 border border-dashed border-border rounded-xl text-muted-foreground">
              <span className="text-sm block">Awaiting face scan...</span>
              <span className="text-xs block mt-1">Ready to process incoming students</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Check-ins bar */}
      <div className="space-y-3">
        <h3 className="font-bold text-xs uppercase text-muted-foreground tracking-wide font-sans">
          Recent Check-Ins ({Object.keys(scannedRecords).length})
        </h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Object.keys(scannedRecords).length > 0 ? (
            Object.values(scannedRecords)
              .sort((a, b) => new Date(b.arrival_time!).getTime() - new Date(a.arrival_time!).getTime())
              .map((rec) => {
                const s = classStudents.find((student) => student.id === rec.student_id);
                return (
                  <div
                    key={rec.id}
                    className="flex items-center gap-2.5 px-4 py-2 border border-border bg-card rounded-lg shrink-0"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <div className="text-xs font-sans">
                      <span className="font-semibold block">{s?.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(rec.arrival_time!).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
          ) : (
            <span className="text-xs text-muted-foreground">No students checked in yet this session.</span>
          )}
        </div>
      </div>
    </div>
  );
}
