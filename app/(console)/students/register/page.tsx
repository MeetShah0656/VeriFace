"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { localDB, LocalStudent, LocalEmbedding } from "@/services/db";
import { db as firestoreDb } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { mediapipeService } from "@/services/mediapipeService";
import { arcfaceService } from "@/services/arcfaceService";
import { faceQuality } from "@/utils/faceQuality";
import {
  Camera,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Smile,
  ShieldAlert,
} from "lucide-react";
import confetti from "canvas-confetti";

interface AngleTarget {
  angle: "front" | "left" | "right" | "up" | "down" | "smile" | "neutral";
  label: string;
  required: number;
  current: number;
}

export default function StudentRegisterPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const studentId = searchParams.get("student");
  const classId = searchParams.get("class");

  const [student, setStudent] = useState<LocalStudent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState(0);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);

  // Camera and Stream Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Capture State
  const [isCapturing, setIsCapturing] = useState(false);
  const [feedback, setFeedback] = useState<string>("Align your face in the camera");
  const [feedbackType, setFeedbackType] = useState<"info" | "success" | "warning">("info");
  
  // Registration targets: 10 samples total
  const [targets, setTargets] = useState<AngleTarget[]>([
    { angle: "front", label: "Front Face", required: 2, current: 0 },
    { angle: "left", label: "Turn Left", required: 2, current: 0 },
    { angle: "right", label: "Turn Right", required: 1, current: 0 },
    { angle: "up", label: "Tilt Up", required: 1, current: 0 },
    { angle: "down", label: "Tilt Down", required: 1, current: 0 },
    { angle: "smile", label: "Smile!", required: 2, current: 0 },
    { angle: "neutral", label: "Neutral Face", required: 1, current: 0 },
  ]);

  // Keep track of collected raw embeddings
  const [collectedEmbeddings, setCollectedEmbeddings] = useState<
    { angle: string; embedding: number[] }[]
  >([]);

  // Keep targets ref to avoid stale closures in requestAnimationFrame loop
  const targetsRef = useRef<AngleTarget[]>(targets);
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  // Throttling references
  const lastProcessedTime = useRef<number>(0);
  const isProcessingFrame = useRef<boolean>(false);
  const animationFrameId = useRef<number | null>(null);

  const totalRequired = targets.reduce((sum, t) => sum + t.required, 0);
  const totalCollected = collectedEmbeddings.length;
  const progressPercent = Math.round((totalCollected / totalRequired) * 100);

  // 1. Fetch Student Details & Initialize AI Models
  useEffect(() => {
    async function init() {
      if (!studentId || !classId) {
        setErrorMsg("Missing student or class reference.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Fetch student profile from local IndexedDB
        const studentData = await localDB.getStudent(studentId);
        if (!studentData) {
          setErrorMsg("Student not found.");
          setIsLoading(false);
          return;
        }
        setStudent(studentData);

        // Load models
        await mediapipeService.getFaceDetector();
        await arcfaceService.loadModel((progress) => {
          setModelProgress(progress);
        });

        setIsModelsLoaded(true);
        setErrorMsg(null);
      } catch (err) {
        console.error(err);
        setErrorMsg("Failed to initialize biometrics engine. Please check network/browser capability.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [studentId, classId]);

  // 2. Start Video Stream
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
      setIsCapturing(true);
      setErrorMsg(null);
    } catch (e) {
      console.error(e);
      setErrorMsg("Unable to access camera. Please check permissions and connection.");
    }
  };

  // 3. Stop Video Stream
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCapturing(false);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  };

  // Start capture loop when camera becomes active
  useEffect(() => {
    if (isCapturing && isModelsLoaded) {
      animationFrameId.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isCapturing, isModelsLoaded]);

  // 4. Guided Capture Frame Processing
  const processFrame = async (time: number) => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const hidden = hiddenCanvasRef.current;

    if (!video || video.paused || video.ended || !isCapturing || video.videoWidth === 0 || video.videoHeight === 0) {
      animationFrameId.current = requestAnimationFrame(processFrame);
      return;
    }

    // Set dimensions
    if (overlay && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }

    // Throttling: 250ms interval between capture inspections
    if (time - lastProcessedTime.current < 250 || isProcessingFrame.current) {
      animationFrameId.current = requestAnimationFrame(processFrame);
      return;
    }

    isProcessingFrame.current = true;
    lastProcessedTime.current = time;

    try {
      const detections = await mediapipeService.detectFaces(video, performance.now());

      if (detections.length === 0) {
        setFeedback("Align your face in the guidelines");
        setFeedbackType("info");
        clearOverlay();
        isProcessingFrame.current = false;
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      if (detections.length > 1) {
        setFeedback("Multiple faces detected - Keep only 1 face in frame");
        setFeedbackType("warning");
        clearOverlay();
        isProcessingFrame.current = false;
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      const detection = detections[0];
      const bbox = detection.boundingBox;

      if (!bbox || !hidden) {
        isProcessingFrame.current = false;
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      // 1. Draw helper bounding box overlay
      drawBoundingBox(bbox);

      // 2. Crop Face to hidden canvas (preserving square aspect ratio and adding padding)
      const croppedCtx = hidden.getContext("2d");
      if (croppedCtx) {
        croppedCtx.clearRect(0, 0, 112, 112);

        // Find the center of the face bounding box
        const centerX = bbox.originX + bbox.width / 2;
        const centerY = bbox.originY + bbox.height / 2;

        // Make the crop area a perfect square based on the maximum dimension
        const size = Math.max(bbox.width, bbox.height);

        // Add 15% padding around the face area (meaning the crop box is 1.3 times the face size)
        const padding = size * 0.15;
        const cropSize = size + padding * 2;

        // Calculate the top-left corner of the padded square
        let startX = centerX - cropSize / 2;
        let startY = centerY - cropSize / 2;

        // Clamp to video boundary coordinates to prevent out-of-bounds sampling
        const videoW = video.videoWidth;
        const videoH = video.videoHeight;

        if (startX < 0) startX = 0;
        if (startY < 0) startY = 0;

        let finalWidth = cropSize;
        let finalHeight = cropSize;

        if (startX + finalWidth > videoW) {
          finalWidth = videoW - startX;
        }
        if (startY + finalHeight > videoH) {
          finalHeight = videoH - startY;
        }

        croppedCtx.drawImage(
          video,
          startX,
          startY,
          finalWidth,
          finalHeight,
          0,
          0,
          112,
          112
        );

        // 3. Run Quality Filter
        const quality = faceQuality.validateFace(
          detection,
          video.videoWidth,
          video.videoHeight,
          croppedCtx,
          112,
          112
        );

        if (!quality.isValid) {
          let warnMsg = "Adjust your position";
          if (quality.reason === "blurry") warnMsg = "Hold still, focusing...";
          else if (quality.reason === "poor_lighting") warnMsg = "Too dark/bright - Improve lighting";
          else if (quality.reason === "face_too_small") warnMsg = "Move closer to the camera";
          else if (quality.reason === "out_of_bounds") warnMsg = "Center your face in the crop box";
          
          setFeedback(warnMsg);
          setFeedbackType("warning");
          drawBoundingBox(bbox, false, warnMsg);

          isProcessingFrame.current = false;
          animationFrameId.current = requestAnimationFrame(processFrame);
          return;
        }

        // 4. Identify remaining angle targets
        const currentTarget = getNextTargetAngle(quality.detectedAngle);

        if (currentTarget) {
          setFeedback(`Capturing angle: ${currentTarget.label}...`);
          setFeedbackType("info");

          // Extract ArcFace embedding
          const embedding = await arcfaceService.extractEmbedding(hidden);
          
          // Play a click beep sound (synthesized via Web Audio API)
          playBeep();

          // Add to collections
          setCollectedEmbeddings((prev) => {
            const updated = [...prev, { angle: currentTarget.angle, embedding }];
            
            // Check if capture is complete
            if (updated.length >= totalRequired) {
              setTimeout(() => handleSaveBiometrics(updated), 500);
            }
            return updated;
          });

          // Update targets ref and state synchronously to prevent overshooting in high-frame-rate loops
          const nextTargets = targetsRef.current.map((t) =>
            t.angle === currentTarget.angle ? { ...t, current: t.current + 1 } : t
          );
          targetsRef.current = nextTargets;
          setTargets(nextTargets);
        } else {
          // No current need for this angle, prompt the next instruction
          const nextInstruction = getInstructionForNextAngle();
          setFeedback(nextInstruction);
          setFeedbackType("info");
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      isProcessingFrame.current = false;
      animationFrameId.current = requestAnimationFrame(processFrame);
    }
  };

  // Helper to draw bounding box
  const drawBoundingBox = (bbox: any, isValid = true, text = "") => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;

    const x = bbox.originX * scaleX;
    const y = bbox.originY * scaleY;
    const w = bbox.width * scaleX;
    const h = bbox.height * scaleY;

    // Draw box border
    ctx.strokeStyle = isValid ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.stroke();

    // Draw text badge
    if (text) {
      ctx.fillStyle = isValid ? "#22c55e" : "#ef4444";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(text, x + 4, y - 6);
    }
  };

  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Audio confirmation click
  const playBeep = () => {
    if (typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, audioCtx.currentTime); // High pitch click beep
      
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio Context beep failed to initialize", e);
    }
  };

  // Find which target needs this detected angle (taking into account smiles/neutrals)
  const getNextTargetAngle = (detectedAngle: string): AngleTarget | null => {
    const currentTargets = targetsRef.current;
    // If the detected angle is front, we could map it to 'front', 'smile', or 'neutral'
    // depending on which is currently active and still has required slots
    if (detectedAngle === "front") {
      // 1. Fill normal front first
      const frontTarget = currentTargets.find((t) => t.angle === "front");
      if (frontTarget && frontTarget.current < frontTarget.required) {
        return frontTarget;
      }
      // 2. Fill smile or neutral depending on instructions
      // For automated capture, if front is satisfied, we check if they are smiling/neutral
      // In this setup, we'll prompt smile and neutral sequentially at the end.
      // So if the current instruction is "Smile!", we map front to smile.
      // If instruction is "Neutral Face", we map to neutral.
      const currentInstruction = getInstructionForNextAngle();
      if (currentInstruction.includes("Smile")) {
        const smileTarget = currentTargets.find((t) => t.angle === "smile");
        if (smileTarget && smileTarget.current < smileTarget.required) return smileTarget;
      } else {
        const neutralTarget = currentTargets.find((t) => t.angle === "neutral");
        if (neutralTarget && neutralTarget.current < neutralTarget.required) return neutralTarget;
      }
      return null;
    }

    const match = currentTargets.find((t) => t.angle === detectedAngle);
    if (match && match.current < match.required) {
      return match;
    }
    return null;
  };

  // Calculate the next angle instructions to display
  const getInstructionForNextAngle = (): string => {
    const currentTargets = targetsRef.current;
    for (const t of currentTargets) {
      if (t.current < t.required) {
        if (t.angle === "front") return "Look straight at the camera";
        if (t.angle === "left") return "Slowly turn your head to your Left";
        if (t.angle === "right") return "Slowly turn your head to your Right";
        if (t.angle === "up") return "Slowly tilt your head Upwards";
        if (t.angle === "down") return "Slowly tilt your head Downwards";
        if (t.angle === "smile") return "Now give a big Smile at the camera";
        if (t.angle === "neutral") return "Keep a straight, Neutral face";
      }
    }
    return "All angles captured! Saving biometrics...";
  };

  // 5. Save Biometric Embeddings to DBs
  const handleSaveBiometrics = async (embeddings: { angle: string; embedding: number[] }[]) => {
    stopCamera();
    setIsLoading(true);
    setFeedback("Saving face templates...");
    
    try {
      const recordsToSave: LocalEmbedding[] = embeddings.map((item, idx) => ({
        id: crypto.randomUUID(),
        student_id: studentId!,
        embedding: item.embedding,
        angle: item.angle,
        created_at: new Date().toISOString(),
      }));

      // 1. Save in local IndexedDB
      await localDB.saveEmbeddings(recordsToSave);

      // 2. Upload to Firestore if online (in the background, don't await)
      if (isOnline && user?.id !== "demo-teacher-uuid") {
        import("firebase/firestore").then(({ writeBatch }) => {
          const batch = writeBatch(firestoreDb);
          recordsToSave.forEach((rec) => {
            const docRef = doc(firestoreDb, "face_embeddings", rec.id);
            batch.set(docRef, {
              id: rec.id,
              student_id: rec.student_id,
              embedding: rec.embedding,
              angle: rec.angle,
              created_at: rec.created_at,
            });
          });
          return batch.commit();
        }).catch((err) => {
          console.error("Firestore face embeddings batch upload failed:", err);
        });
      }

      // Trigger Confetti Celebration!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      alert("Biometric face registration completed successfully!");
      router.push("/classes");
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to save biometric templates. Please try again.");
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-[70vh] items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center space-y-1">
          <p className="font-bold text-sm font-sans">Configuring Biometrics Engine...</p>
          {modelProgress > 0 && modelProgress < 100 && (
            <p className="text-xs text-muted-foreground">Downloading AI Model: {modelProgress}%</p>
          )}
        </div>
      </div>
    );
  }

  if (errorMsg && !isCapturing) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 p-8 border border-border rounded-xl bg-card">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold font-sans">Biometrics Failure</h2>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <button
          onClick={() => router.push("/classes")}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Back to Classes
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
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
            Register Biometrics: {student?.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Roll Number: {student?.roll_number} | Capture 10 face angle samples
          </p>
        </div>
      </div>

      {/* Main Grid: Camera Viewport vs Angle Progress lists */}
      <div className="grid md:grid-cols-5 gap-8 items-start">
        {/* Camera Viewport (Col span 3) */}
        <div className="md:col-span-3 flex flex-col items-center gap-4">
          <div className="relative w-full aspect-[4/3] max-w-[480px] bg-black rounded-2xl overflow-hidden border border-border group shadow-sm">
            {/* Guide Silhouette overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center opacity-40 group-hover:opacity-20 transition-opacity">
              <div className="w-[180px] h-[240px] rounded-[50%] border-2 border-dashed border-white" />
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

            {!isCapturing && (
              <div className="absolute inset-0 z-30 bg-card/85 flex flex-col items-center justify-center p-6 text-center gap-4">
                <Camera className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="font-bold text-sm">Face Scanner Ready</h3>
                  <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                    Ensure student is centered, is alone in the frame, and has good face lighting.
                  </p>
                </div>
                <button
                  onClick={startCamera}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Start Camera Feed
                </button>
              </div>
            )}
          </div>

          {/* Feedback instructions bar */}
          {isCapturing && (
            <div
              className={`w-full max-w-[480px] p-4 rounded-xl border text-center text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                feedbackType === "success"
                  ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
                  : feedbackType === "warning"
                  ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                  : "bg-muted/30 border-border text-muted-foreground"
              }`}
            >
              {feedbackType === "warning" && <AlertTriangle className="h-4 w-4 shrink-0" />}
              {feedbackType === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span className="font-sans">{feedback}</span>
            </div>
          )}
        </div>

        {/* Progress Grid (Col span 2) */}
        <div className="md:col-span-2 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-muted-foreground uppercase tracking-wide text-xs">
                Registration Progress
              </span>
              <span className="font-bold font-mono">
                {totalCollected} / {totalRequired} ({progressPercent}%)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Progress checklists per angle */}
          <div className="border border-border rounded-xl bg-card divide-y divide-border overflow-hidden">
            {targets.map((target) => (
              <div key={target.angle} className="flex items-center justify-between p-4 bg-muted/5">
                <div className="space-y-0.5">
                  <span className="font-bold text-sm block font-sans">{target.label}</span>
                  <span className="text-xs text-muted-foreground">
                    Required angle sample
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold">
                    {target.current} / {target.required}
                  </span>
                  
                  {target.current >= target.required ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 fill-green-500/10" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-dashed border-border" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
