export interface FaceQualityResult {
  isValid: boolean;
  reason?: "multiple_faces" | "face_too_small" | "blurry" | "poor_lighting" | "out_of_bounds" | "invalid_angle";
  detectedAngle: "front" | "left" | "right" | "up" | "down" | "unknown";
  metrics: {
    blurScore: number;
    brightness: number;
    faceSizeRatio: number;
    yawRatio: number;
    pitchRatio: number;
  };
}

export const faceQuality = {
  // Compute Laplacian variance on the cropped face canvas to detect blur
  getBlurScore(ctx: CanvasRenderingContext2D, width: number, height: number): number {
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Convert to grayscale
      const gray = new Float32Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }

      // Compute Laplacian variance
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          // Laplacian kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0]
          const val =
            gray[idx - 1] +
            gray[idx + 1] +
            gray[idx - width] +
            gray[idx + width] -
            4 * gray[idx];
          
          sum += val;
          sumSq += val * val;
          count++;
        }
      }

      const mean = sum / count;
      const variance = sumSq / count - mean * mean;
      return variance;
    } catch (e) {
      return 100; // Return normal score on error
    }
  },

  // Calculate average brightness
  getBrightness(ctx: CanvasRenderingContext2D, width: number, height: number): number {
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      let totalLuminance = 0;
      const step = 4; // Sample every 4th pixel for speed
      let count = 0;

      for (let i = 0; i < data.length; i += 4 * step) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Standard relative luminance formula
        totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
        count++;
      }

      return totalLuminance / count;
    } catch (e) {
      return 128; // Default neutral brightness on error
    }
  },

  // Core validation function
  validateFace(
    detection: any,
    videoWidth: number,
    videoHeight: number,
    croppedFaceCtx: CanvasRenderingContext2D,
    cropWidth: number,
    cropHeight: number
  ): FaceQualityResult {
    // 1. Check if face is present and bounding box is valid
    if (!detection || !detection.boundingBox) {
      return {
        isValid: false,
        reason: "out_of_bounds",
        detectedAngle: "unknown",
        metrics: { blurScore: 0, brightness: 0, faceSizeRatio: 0, yawRatio: 0, pitchRatio: 0 },
      };
    }

    const bbox = detection.boundingBox;
    const faceWidth = bbox.width;
    const faceHeight = bbox.height;

    // Check if cropped image size is zero or negative
    if (faceWidth <= 0 || faceHeight <= 0) {
      return {
        isValid: false,
        reason: "out_of_bounds",
        detectedAngle: "unknown",
        metrics: { blurScore: 0, brightness: 0, faceSizeRatio: 0, yawRatio: 0, pitchRatio: 0 },
      };
    }

    // 2. Check face size ratio (must be large enough in the frame)
    const frameArea = videoWidth * videoHeight;
    const faceArea = faceWidth * faceHeight;
    const faceSizeRatio = faceArea / frameArea;

    if (faceWidth < 80 || faceHeight < 80 || faceSizeRatio < 0.02) {
      return {
        isValid: false,
        reason: "face_too_small",
        detectedAngle: "unknown",
        metrics: { blurScore: 0, brightness: 0, faceSizeRatio, yawRatio: 0, pitchRatio: 0 },
      };
    }

    // 3. Check for out-of-bounds boundary cut-offs
    if (
      bbox.originX < 0 ||
      bbox.originY < 0 ||
      bbox.originX + faceWidth > videoWidth ||
      bbox.originY + faceHeight > videoHeight
    ) {
      return {
        isValid: false,
        reason: "out_of_bounds",
        detectedAngle: "unknown",
        metrics: { blurScore: 0, brightness: 0, faceSizeRatio, yawRatio: 0, pitchRatio: 0 },
      };
    }

    // 4. Validate lighting conditions (brightness)
    const brightness = this.getBrightness(croppedFaceCtx, cropWidth, cropHeight);
    if (brightness < 45 || brightness > 240) {
      return {
        isValid: false,
        reason: "poor_lighting",
        detectedAngle: "unknown",
        metrics: { blurScore: 0, brightness, faceSizeRatio, yawRatio: 0, pitchRatio: 0 },
      };
    }

    // 5. Validate blur (sharpness)
    const blurScore = this.getBlurScore(croppedFaceCtx, cropWidth, cropHeight);
    if (blurScore < 4.0) { // Values below 4 indicate high blur in 112x112 thumbnails
      return {
        isValid: false,
        reason: "blurry",
        detectedAngle: "unknown",
        metrics: { blurScore, brightness, faceSizeRatio, yawRatio: 0, pitchRatio: 0 },
      };
    }

    // 6. Estimate head pose based on the 6 MediaPipe landmarks
    // Landmarks are: 0: right eye, 1: left eye, 2: nose tip, 3: mouth center, 4: right ear, 5: left ear
    // Note: Coordinates are normalized (0 to 1)
    const keypoints = detection.keypoints;
    if (!keypoints || keypoints.length < 6) {
      return {
        isValid: false,
        reason: "out_of_bounds",
        detectedAngle: "unknown",
        metrics: { blurScore, brightness, faceSizeRatio, yawRatio: 0, pitchRatio: 0 },
      };
    }

    const re = keypoints[0]; // Right eye (camera view left)
    const le = keypoints[1]; // Left eye (camera view right)
    const nt = keypoints[2]; // Nose tip
    const mc = keypoints[3]; // Mouth center
    const re_ear = keypoints[4]; // Right ear
    const le_ear = keypoints[5]; // Left ear

    // Yaw (Left/Right) Estimation: 
    // Compare nose horizontal position relative to the eyes
    const eyeDistance = le.x - re.x;
    const yawRatio = eyeDistance > 0 ? (nt.x - re.x) / eyeDistance : 0.5;

    // Pitch (Up/Down) Estimation:
    // Compare nose vertical position relative to eye-mouth distance
    const eyeY = (re.y + le.y) / 2;
    const noseToEyeHeight = nt.y - eyeY;
    const mouthToEyeHeight = mc.y - eyeY;
    const pitchRatio = mouthToEyeHeight > 0 ? noseToEyeHeight / mouthToEyeHeight : 0.5;

    let detectedAngle: "front" | "left" | "right" | "up" | "down" | "unknown" = "front";

    // Thresholds tuned for BlazeFace normalized keypoints
    if (yawRatio < 0.35) {
      detectedAngle = "right"; // Head turned right (nose shifts towards right eye / screen-left)
    } else if (yawRatio > 0.65) {
      detectedAngle = "left";  // Head turned left
    } else if (pitchRatio < 0.35) {
      detectedAngle = "up";    // Head tilted up (nose shifts up towards eyes)
    } else if (pitchRatio > 0.62) {
      detectedAngle = "down";  // Head tilted down (nose shifts down towards mouth)
    }

    return {
      isValid: true,
      detectedAngle,
      metrics: {
        blurScore,
        brightness,
        faceSizeRatio,
        yawRatio,
        pitchRatio,
      },
    };
  },
};
