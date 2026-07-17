import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

let faceDetectorInstance: FaceDetector | null = null;
let initPromise: Promise<FaceDetector> | null = null;

export const mediapipeService = {
  async getFaceDetector(): Promise<FaceDetector> {
    if (faceDetectorInstance) {
      return faceDetectorInstance;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      try {
        // Load the FilesetResolver for Vision Tasks from the jsdelivr CDN
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );

        // Load the BlazeFace short range model
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });

        faceDetectorInstance = detector;
        return detector;
      } catch (err) {
        console.error("Failed to initialize MediaPipe FaceDetector:", err);
        initPromise = null; // Reset on failure so we can retry
        throw err;
      }
    })();

    return initPromise;
  },

  async detectFaces(
    videoElement: HTMLVideoElement,
    timestamp: number
  ): Promise<any[]> {
    try {
      const detector = await this.getFaceDetector();
      const results = detector.detectForVideo(videoElement, timestamp);
      return results.detections || [];
    } catch (err) {
      console.error("Face detection error:", err);
      return [];
    }
  },
};
