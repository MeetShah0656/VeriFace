import * as ort from "onnxruntime-web";

// Configure WASM paths for onnxruntime-web
// Uses jsDelivr CDN to serve the WASM binaries - this works in any deployment environment
// without requiring WASM files to be self-hosted. Version must match installed package.
if (typeof window !== "undefined") {
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";

}


const MODEL_URL = "https://huggingface.co/garavv/arcface-onnx/resolve/main/arc.onnx";
const CACHE_NAME = "veriface-onnx-cache";

let sessionInstance: ort.InferenceSession | null = null;
let initPromise: Promise<ort.InferenceSession> | null = null;

export const arcfaceService = {
  // Download the model with progress tracking and cache it via the browser's Cache Storage API
  async loadModel(onProgress?: (progress: number) => void): Promise<ort.InferenceSession> {
    if (sessionInstance) {
      return sessionInstance;
    }

    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      try {
        let modelBuffer: ArrayBuffer;

        // Try browser caches first
        if (typeof window !== "undefined" && "caches" in window) {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(MODEL_URL);

          if (cachedResponse) {
            console.log("Loading ArcFace model from Cache Storage...");
            modelBuffer = await cachedResponse.arrayBuffer();
          } else {
            console.log("ArcFace model not cached. Fetching from remote...");
            modelBuffer = await this.fetchWithProgress(MODEL_URL, onProgress);
            
            // Put it in cache for future loads
            const responseToCache = new Response(modelBuffer, {
              headers: { "Content-Type": "application/octet-stream" },
            });
            await cache.put(MODEL_URL, responseToCache);
          }
        } else {
          // Fallback to fetch without cache
          modelBuffer = await this.fetchWithProgress(MODEL_URL, onProgress);
        }

        console.log("Initializing ONNX Inference Session...");
        // Disable profiling and configure execution settings
        const session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: ["wasm"],
        });

        sessionInstance = session;
        return session;
      } catch (err) {
        console.error("Failed to load ArcFace ONNX model:", err);
        initPromise = null; // Reset so user can retry
        throw err;
      }
    })();

    return initPromise;
  },

  // Helper function to fetch file with progress updates
  async fetchWithProgress(url: string, onProgress?: (progress: number) => void): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.body) {
      throw new Error("ReadableStream not supported by fetch response");
    }

    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get("content-length")) || 0;
    
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      if (onProgress && contentLength > 0) {
        const percent = Math.round((receivedLength / contentLength) * 100);
        onProgress(percent);
      }
    }

    // Combine chunks into single ArrayBuffer
    const result = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }

    return result.buffer;
  },

  // Preprocess cropped face image (112x112 canvas) and extract embedding
  async extractEmbedding(
    faceCanvas: HTMLCanvasElement,
    onProgress?: (progress: number) => void
  ): Promise<number[]> {
    const session = await this.loadModel(onProgress);

    const ctx = faceCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2d context for face canvas");
    }

    // Get RGBA pixel values
    const imgData = ctx.getImageData(0, 0, 112, 112);
    const data = imgData.data;

    // Preprocess: Convert pixel values [0, 255] to [-1, 1] using (x - 127.5) / 128.0
    // ArcFace expects NHWC format: [1, 112, 112, 3] where channels are interleaved (R, G, B, R, G, B...)
    const floatData = new Float32Array(112 * 112 * 3);
    const imageSize = 112 * 112;

    for (let i = 0; i < imageSize; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];

      floatData[i * 3] = (r - 127.5) / 128.0;       // R Channel
      floatData[i * 3 + 1] = (g - 127.5) / 128.0;   // G Channel
      floatData[i * 3 + 2] = (b - 127.5) / 128.0;   // B Channel
    }

    // Create ONNX Tensor
    const inputTensor = new ort.Tensor("float32", floatData, [1, 112, 112, 3]);

    // Feed to ONNX model
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    
    const outputMap = await session.run({ [inputName]: inputTensor });
    const outputTensor = outputMap[outputName];
    const rawEmbeddings = outputTensor.data as Float32Array;

    // L2-Normalize the resulting 512-dimension vector
    return this.l2Normalize(rawEmbeddings);
  },

  // Calculate L2 Normalization
  l2Normalize(vector: Float32Array): number[] {
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq);
    const normalized = [];
    for (let i = 0; i < vector.length; i++) {
      normalized.push(norm > 0 ? vector[i] / norm : 0);
    }
    return normalized;
  },

  // Calculate cosine similarity between two L2-normalized vectors (simply the dot product)
  calculateSimilarity(embeddingA: number[], embeddingB: number[]): number {
    if (embeddingA.length !== embeddingB.length) return 0;
    let dotProduct = 0;
    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
    }
    return dotProduct; // Pre-normalized vectors, so dot product is the cosine similarity
  },

  // Compares a query embedding with a database of student embeddings and returns the best match
  findBestMatch(
    queryEmbedding: number[],
    studentsWithEmbeddings: { student: any; embeddings: any[] }[],
    threshold: number = 0.65
  ): { student: any; similarity: number; matchAngle: string } | null {
    let bestMatch: { student: any; similarity: number; matchAngle: string } | null = null;
    let maxSimilarity = -1;

    for (const item of studentsWithEmbeddings) {
      for (const embedRecord of item.embeddings) {
        // Handle database array conversions if retrieved from JSON
        const dbEmbedding = Array.isArray(embedRecord.embedding)
          ? embedRecord.embedding
          : Object.values(embedRecord.embedding);
          
        const similarity = this.calculateSimilarity(queryEmbedding, dbEmbedding);

        if (similarity > threshold && similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatch = {
            student: item.student,
            similarity,
            matchAngle: embedRecord.angle,
          };
        }
      }
    }

    return bestMatch;
  },
};
