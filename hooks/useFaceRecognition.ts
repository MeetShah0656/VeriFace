import { useEffect, useRef, useState, useCallback } from "react";
import { mediapipeService } from "@/services/mediapipeService";
import { arcfaceService } from "@/services/arcfaceService";
import { faceQuality, FaceQualityResult } from "@/utils/faceQuality";
import { localDB, LocalStudent } from "@/services/db";

export interface RecognitionConfig {
  threshold?: number;
  detectionIntervalMs?: number;
  qualityCheck?: boolean;
}

export interface MatchSuccessResult {
  student: LocalStudent;
  similarity: number;
  matchAngle: string;
}

export function useFaceRecognition(classId: string | null, config: RecognitionConfig = {}) {
  const {
    threshold = 0.65,
    detectionIntervalMs = 200, // Throttling face recognition to prevent lagging
    qualityCheck = true,
  } = config;

  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [studentsWithEmbeddings, setStudentsWithEmbeddings] = useState<any[]>([]);
  const studentsWithEmbeddingsRef = useRef<any[]>(studentsWithEmbeddings);
  useEffect(() => {
    studentsWithEmbeddingsRef.current = studentsWithEmbeddings;
  }, [studentsWithEmbeddings]);

  const [activeStatus, setActiveStatus] = useState<string>("Initializing...");
  const [qualityFeedback, setQualityFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null); // For cropping face thumbnail
  const animationFrameId = useRef<number | null>(null);
  const lastProcessedTime = useRef<number>(0);
  const isProcessingFrame = useRef<boolean>(false);
  const onMatchRef = useRef<((result: MatchSuccessResult) => void) | null>(null);

  // 1. Initialize models and load class embeddings
  useEffect(() => {
    async function init() {
      if (!classId) return;
      try {
        setIsLoadingModels(true);
        setActiveStatus("Loading AI models...");
        setLoadProgress(10);

        // Load MediaPipe Face Detector
        await mediapipeService.getFaceDetector();
        setLoadProgress(40);

        // Load ArcFace ONNX Model with progress callback
        await arcfaceService.loadModel((progress) => {
          // Map 0-100 progress from ArcFace download to 40-100 overall
          const overallProgress = Math.round(40 + (progress * 60) / 100);
          setLoadProgress(overallProgress);
        });

        // Load students and embeddings for the current class from IndexedDB
        setActiveStatus("Loading class data...");
        const data = await localDB.getEmbeddingsForClass(classId);
        setStudentsWithEmbeddings(data);

        setIsLoadingModels(false);
        setActiveStatus("Ready");
        setErrorMsg(null);
      } catch (err: any) {
        console.error("Initialization error:", err);
        setErrorMsg("Failed to load facial recognition models. Please check your internet connection and try again.");
        setIsLoadingModels(false);
        setActiveStatus("Initialization failed");
      }
    }

    init();
  }, [classId]);

  // 2. Crop face from video frame coordinates and draw onto 112x112 canvas (preserving square aspect ratio and adding padding)
  const cropFace = useCallback((
    video: HTMLVideoElement,
    bbox: any,
    targetCanvas: HTMLCanvasElement
  ): CanvasRenderingContext2D | null => {
    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return null;

    // MediaPipe bounding box coordinates
    const { originX, originY, width, height } = bbox;

    // Clear previous drawing
    ctx.clearRect(0, 0, 112, 112);

    // 1. Find the center of the face bounding box
    const centerX = originX + width / 2;
    const centerY = originY + height / 2;

    // 2. Make the crop area a perfect square based on the maximum dimension
    const size = Math.max(width, height);

    // 3. Add 15% padding around the face area (meaning the crop box is 1.3 times the face size)
    const padding = size * 0.15;
    const cropSize = size + padding * 2;

    // 4. Calculate the top-left corner of the padded square
    let startX = centerX - cropSize / 2;
    let startY = centerY - cropSize / 2;

    // 5. Clamp to video boundary coordinates to prevent out-of-bounds sampling
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

    // 6. Draw the square crop onto the 112x112 canvas
    ctx.drawImage(
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

    return ctx;
  }, []);

  // 3. Draw bounding box on overlay canvas
  const drawOverlay = useCallback((
    bbox: any,
    videoWidth: number,
    videoHeight: number,
    canvas: HTMLCanvasElement,
    isValid: boolean,
    label: string
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous frame overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Map canvas coordinates to video dimensions
    const scaleX = canvas.width / videoWidth;
    const scaleY = canvas.height / videoHeight;

    const x = bbox.originX * scaleX;
    const y = bbox.originY * scaleY;
    const w = bbox.width * scaleX;
    const h = bbox.height * scaleY;

    // Draw box
    ctx.strokeStyle = isValid ? "#22c55e" : "#ef4444"; // Green if valid, Red if invalid
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.stroke();

    // Draw label
    if (label) {
      ctx.fillStyle = isValid ? "#22c55e" : "#ef4444";
      ctx.font = "bold 14px sans-serif";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, x + 4, y - 6);
    }
  }, []);

  // 4. The processing loop
  const processFrame = useCallback(async (time: number) => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const hidden = hiddenCanvasRef.current;

    if (!video || video.paused || video.ended || isLoadingModels || video.videoWidth === 0 || video.videoHeight === 0) {
      animationFrameId.current = requestAnimationFrame(processFrame);
      return;
    }

    // Adjust overlay dimensions to match video viewport if needed
    if (overlay && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }

    // Throttling: Check if enough time has passed since last check
    if (time - lastProcessedTime.current < detectionIntervalMs || isProcessingFrame.current) {
      animationFrameId.current = requestAnimationFrame(processFrame);
      return;
    }

    isProcessingFrame.current = true;
    lastProcessedTime.current = time;

    try {
      // Run MediaPipe Face Detector
      const detections = await mediapipeService.detectFaces(video, performance.now());

      if (detections.length === 0) {
        setQualityFeedback("No face detected");
        if (overlay) {
          const ctx = overlay.getContext("2d");
          ctx?.clearRect(0, 0, overlay.width, overlay.height);
        }
        isProcessingFrame.current = false;
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      if (detections.length > 1) {
        setQualityFeedback("Multiple faces detected - Please scan one at a time");
        if (overlay) {
          const ctx = overlay.getContext("2d");
          ctx?.clearRect(0, 0, overlay.width, overlay.height);
        }
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

      // Crop face onto hidden canvas
      const croppedCtx = cropFace(video, bbox, hidden);

      if (!croppedCtx) {
        isProcessingFrame.current = false;
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      // Validate face quality
      let quality: FaceQualityResult = {
        isValid: true,
        detectedAngle: "front",
        metrics: { blurScore: 10, brightness: 120, faceSizeRatio: 0.1, yawRatio: 0.5, pitchRatio: 0.5 },
      };

      if (qualityCheck) {
        quality = faceQuality.validateFace(
          detection,
          video.videoWidth,
          video.videoHeight,
          croppedCtx,
          112,
          112
        );
      }

      if (!quality.isValid) {
        // Generate user feedback based on failure reason
        let feedback = "Adjust position";
        if (quality.reason === "blurry") feedback = "Hold still, autofocusing...";
        else if (quality.reason === "poor_lighting") feedback = "Poor lighting - Move to a brighter area";
        else if (quality.reason === "face_too_small") feedback = "Move closer to the camera";
        else if (quality.reason === "out_of_bounds") feedback = "Keep your face centered";

        setQualityFeedback(feedback);

        if (overlay) {
          drawOverlay(bbox, video.videoWidth, video.videoHeight, overlay, false, feedback);
        }

        isProcessingFrame.current = false;
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      // Face is valid, run embedding extraction
      setQualityFeedback("Processing...");
      if (overlay) {
        drawOverlay(bbox, video.videoWidth, video.videoHeight, overlay, true, "Scanning...");
      }

      const embedding = await arcfaceService.extractEmbedding(hidden);

      // Perform matching
      const match = arcfaceService.findBestMatch(
        embedding,
        studentsWithEmbeddingsRef.current,
        threshold
      );

      if (match) {
        setQualityFeedback(`Match: ${match.student.name}`);
        if (overlay) {
          drawOverlay(
            bbox,
            video.videoWidth,
            video.videoHeight,
            overlay,
            true,
            `${match.student.name} (${Math.round(match.similarity * 100)}%)`
          );
        }

        // Trigger matching callback
        if (onMatchRef.current) {
          onMatchRef.current(match);
        }
      } else {
        setQualityFeedback("Unknown face");
        if (overlay) {
          drawOverlay(bbox, video.videoWidth, video.videoHeight, overlay, false, "Unknown Face");
        }
      }
    } catch (err) {
      console.error("Frame processing loop error:", err);
    } finally {
      isProcessingFrame.current = false;
      animationFrameId.current = requestAnimationFrame(processFrame);
    }
  }, [isLoadingModels, detectionIntervalMs, threshold, qualityCheck, cropFace, drawOverlay, studentsWithEmbeddings]);

  // 5. Public start/stop controllers
  const startRecognition = useCallback((
    videoElement: HTMLVideoElement,
    overlayCanvas: HTMLCanvasElement,
    hiddenCanvas: HTMLCanvasElement,
    onMatch: (result: MatchSuccessResult) => void
  ) => {
    videoRef.current = videoElement;
    overlayCanvasRef.current = overlayCanvas;
    hiddenCanvasRef.current = hiddenCanvas;
    onMatchRef.current = onMatch;

    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }

    lastProcessedTime.current = 0;
    isProcessingFrame.current = false;
    animationFrameId.current = requestAnimationFrame(processFrame);
    setActiveStatus("Scanning active");
  }, [processFrame]);

  const stopRecognition = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    // Clear overlay
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }

    setQualityFeedback(null);
    setActiveStatus("Scanner paused");
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return {
    isLoadingModels,
    loadProgress,
    errorMsg,
    activeStatus,
    qualityFeedback,
    startRecognition,
    stopRecognition,
    studentsCount: studentsWithEmbeddings.length,
    refreshEmbeddings: async () => {
      if (classId) {
        const data = await localDB.getEmbeddingsForClass(classId);
        setStudentsWithEmbeddings(data);
      }
    }
  };
}
