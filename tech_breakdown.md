# VeriFace Technology & Architecture Breakdown

This document provides a comprehensive analysis of the technologies, libraries, and design patterns used in **VeriFace**, explaining the purpose of each component and how they interact to build a high-performance, offline-first facial recognition attendance SaaS.

---

## 🏗️ Architectural Overview

VeriFace is designed as a **hybrid cloud/edge serverless application**. 
* **The Edge (Client Browser)** handles all real-time video streams, face detection, biometric quality filtering, embedding generation, database checks, and offline logging.
* **The Cloud (Firebase)** handles teacher authentication, persistent backup storage, and data syncing.

```mermaid
graph TD
  A[User Interface / React 19] --> B[useFaceRecognition Hook]
  B --> C[MediaPipe Face Detector]
  B --> D[ArcFace ONNX Runtime Web]
  B --> E[(Local IndexedDB Cache)]
  E --> F[Sync Service]
  F -- Online -- > G[Firebase Firestore]
  A --> H[Firebase Auth]
```

---

## 🛠️ Technology Stack Breakdown

### 1. Core Framework & Language
* **Next.js 15 (App Router)**: The base full-stack React framework. Used for client-side routing, static pre-rendering, layout structuring, and serving assets.
* **React 19**: The core component framework. It manages state transitions, camera stream bindings, hooks, and pages.
* **TypeScript**: Enforces strict typing across students, classes, attendance sessions, and biometric vectors, reducing runtime exceptions during binary model inference.

### 2. Client-Side AI & Biometrics (The Core Pipeline)
To avoid high server costs and maintain absolute user privacy, all AI processing happens client-side in the browser:
* **MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)**: Used for real-time bounding box detection and 2D facial landmark tracking.
  * *Under the hood:* It loads the `blaze_face_short_range.tflite` model in the browser using WebAssembly.
* **ONNX Runtime Web (`onnxruntime-web`)**: A high-performance WebAssembly (WASM) execution engine that runs neural network models directly inside the browser.
  * *Under the hood:* It loads the ArcFace model (`arc.onnx`), utilizing multi-threaded WASM with SIMD instructions to run neural network inference on CPU at ~30 FPS.
* **ArcFace Model (`arc.onnx`)**: A state-of-the-art deep learning convolutional neural network (CNN) model. It takes a `112x112` face crop and generates a unique **512-dimensional vector (embedding)** representing the mathematical features of the face.
* **Cosine Similarity Matcher**: A lightweight mathematical formula (dot product of L2-normalized embedding arrays) that calculates the similarity between two faces. A similarity of `> 0.65` indicates a matching student.

### 3. Offline-First Storage & Cloud Database
* **IndexedDB (`idb` wrapper)**: A low-level transactional browser database used to store large volumes of structured data (rosters, classes, attendance records, and facial embeddings) directly on the teacher's device.
  * *Why:* Allows the app to continue scanning faces and saving attendance sessions in remote areas with zero network connection.
* **Firebase Cloud Firestore**: The cloud NoSQL database that acts as the source of truth when online.
* **Firebase Authentication**: Provides secure sign-in (via Email/Password and Google OAuth) for teachers.
* **Firebase Security Rules (`firestore.rules`)**: Enforces server-side isolation so that teachers can *only* read and write their own classes, students, and biometric data.
* **Sync Engine (`services/syncService.ts`)**: Runs in the background, listening to online/offline status changes. When internet is restored, it batch-uploads local records in IndexedDB to Firestore and pulls down any new changes.

### 4. Styling, Visuals & UI Components
* **Tailwind CSS v4**: Utility-first CSS framework used for UI layout, responsive breakpoints, grid systems, and dark/light themes.
* **Framer Motion**: Powering fluid UI micro-animations, dashboard transitions, and success/error overlay animations during camera scans.
* **Lucide React**: Clean, modern SVG icon set used across menus, sidebar items, and action states.
* **Recharts**: Data visualization library used on the dashboard to build attendance logs, daily/weekly charts, and trends.

### 5. Form Management & Utilities
* **React Hook Form & Zod**: Form handling and schema validation. Used on the student registration and class creation pages to ensure correct schema types before database writes.
* **XLSX (SheetJS)**: Client-side Excel generator that allows teachers to instantly download complete class matrices (dates vs. students attendance statuses) directly from the browser.
* **Canvas Confetti**: Visual celebration effect triggered upon successful student registration or complete attendance scans.

---

## 📁 Project Directory Breakdown

```
VeriFace/
├── app/                      # Next.js 15 App Router pages, layouts, and routes
│   ├── (console)/            # Private authenticated routes (Classes, Students, Sessions, Dashboard)
│   ├── login/                # Authentication page (Google / Email)
│   ├── globals.css           # Global Tailwind stylesheet and theme variables
│   └── layout.tsx            # Main HTML layout wrapper
│
├── components/               # Shared UI elements (buttons, layout panels, dialogs)
│
├── contexts/                 # Global React states (Auth user state, TanStack query cache provider)
│
├── features/                 # Modular page feature scopes (Dashboard components, stats cards)
│
├── hooks/                    # Reusable custom hooks
│   ├── useFaceRecognition.ts # Core hook managing MediaPipe/ONNX cameras, loop, and crops
│   └── useOnlineStatus.ts    # Tracks browser connection state (online vs offline)
│
├── lib/                      # Third-party SDK initializations (Firebase configurations)
│
├── public/                   # Static browser-accessible models and assets
│   ├── mediapipe/            # Local WASM files and blaze_face model binary
│   └── ort-wasm-...          # local WebAssembly binaries for ONNX runtime web
│
├── services/                 # Business logic and database API files
│   ├── db.ts                 # IndexedDB initialization and transactional queries
│   ├── arcfaceService.ts     # ONNX session loading, image preprocessing, and similarity matching
│   ├── mediapipeService.ts   # MediaPipe face detection model initializer
│   └── syncService.ts        # Sync manager merging IndexedDB and Firestore
│
└── utils/                    # Helper files
    └── faceQuality.ts        # Math checks verifying blur, yaw/pitch, and brightness
```

---

## ⚡ The Recognition Pipeline (Step-by-Step)

When a student stands in front of the camera:
1. **Camera Capture**: React binds the camera stream to a `<video>` element.
2. **Face Detection**: The `useFaceRecognition` hook throttles the feed and feeds frames to the **MediaPipe Face Detector** at a specified interval (e.g. 250ms).
3. **Face Quality Filter**: The detected face bounding box coordinates are analyzed by `faceQuality.ts` checking:
   * **Sharpness**: Laplacian variance calculation filters out camera motion blur.
   * **Illumination**: Relative luminance calculation flags dark or overexposed frames.
   * **Angle**: Landmark coordinates measure head yaw and pitch, prompting the user if they are looking away.
4. **Square Crop & Padding**: The face is cropped into a perfect square with **15% padding** using an HTML Canvas to prevent stretching distortion.
5. **Embedding Extraction**: The square crop canvas is passed into the **ArcFace ONNX model** to generate a normalized 512D float array.
6. **Cosine Similarity**: The vector is dot-product compared with all registered student vectors in the active class batch.
7. **Mark Attendance**: If a similarity score exceeds the threshold, the backend registers the entry in IndexedDB/Firestore, plays a chime, and runs a confetti splash.
