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

| Category | Technology / Library | Purpose & Under-the-Hood Mechanics |
| :--- | :--- | :--- |
| **Core Framework** | **Next.js 15 (App Router)** | Base React framework. Manages layout templates, client-side routing, asset optimization, static pre-rendering, and page delivery. |
| **UI Library** | **React 19** | Handles interactive state updates, binds DOM refs to webcam video feeds, manages hooks, and handles page rendering. |
| **Language** | **TypeScript** | Enforces strict schemas and data interfaces for students, classes, attendance sessions, and 512D biometric vector arrays. |
| **AI - Detection** | **MediaPipe Face Detector** | Performs rapid bounding box detection and returns 2D coordinates for 6 key face landmarks (eyes, nose, mouth, ears) via a lightweight BlazeFace WASM model. |
| **AI - Inference** | **ONNX Runtime Web** | A high-performance WebAssembly (WASM) compiler running ArcFace neural net models inside the browser using multi-threaded SIMD CPU features. |
| **AI - Model** | **ArcFace CNN (`arc.onnx`)** | Deep learning model loaded from Hugging Face. Analyzes a `112x112` square face crop and converts it into a unique **512-dimensional vector embedding**. |
| **AI - Metric** | **Cosine Similarity** | Calculates similarity using the dot product of two L2-normalized float arrays. Any score `> 0.65` verifies a successful student match. |
| **Offline Cache** | **IndexedDB (`idb` wrapper)** | Browser-local transactional storage used to cache student rosters, classes, embeddings, and attendance logs, enabling 100% internet-free scans. |
| **Cloud Database** | **Cloud Firestore** | Remote NoSQL database backing up teacher profiles, class setups, and verified rosters once online. |
| **Authentication** | **Firebase Auth** | Manages teacher secure authentication (Email/Password & Google OAuth). |
| **Security** | **Firebase Security Rules** | Isolates teacher nodes server-side so teachers can only access database records owned by their authenticated UID (`request.auth.uid`). |
| **Styling** | **Tailwind CSS v4** | Utility-first compiler powering layouts, responsive grids, transitions, and dark/light color themes. |
| **Animations** | **Framer Motion** | Controls micro-animations, loading states, success screens, and alert popups. |
| **Visual Elements** | **Lucide React** | High-quality, lightweight SVG icon package used throughout dashboard dashboards. |
| **Charts** | **Recharts** | Interactive SVG charts rendering historical student attendance analytics. |
| **Forms** | **React Hook Form & Zod** | Handles validation rules for client-side forms (student registration, class registration details). |
| **Data Export** | **SheetJS (`xlsx`)** | Generates formatted Excel spreadsheets client-side, allowing teachers to download attendance summaries directly. |
| **Celebration** | **Canvas Confetti** | Fires confetti bursts on the screen during successful registration and scan sessions. |

---

## 📁 Project Directory Structure

| Directory / File | Core Responsibility | Key Contents |
| :--- | :--- | :--- |
| **`app/`** | Application Routing & Layouts | Contains route subfolders like `login`, `(console)/dashboard`, `(console)/students`, layouts, and `globals.css` style files. |
| **`components/`** | Common UI Components | Reusable components (e.g., modals, form buttons, dashboard panels). |
| **`contexts/`** | Application-Wide Context Providers | Authentication context (`auth-context.tsx`) and React Query cache provider (`query-provider.tsx`). |
| **`features/`** | Route-Specific Widgets & UI Panels | Dashboard visual cards, charts, and table logic. |
| **`hooks/`** | Custom React State Hooks | `useFaceRecognition.ts` (camera control and model processing) and `useOnlineStatus.ts`. |
| **`lib/`** | Shared Library Clients | Firebase configuration and client instance variables (`firebase.ts`). |
| **`public/`** | Static Browser Assets | Local WASM binaries for MediaPipe (`public/mediapipe`) and ONNX Runtime. |
| **`services/`** | core Business Logic & Database Engines | IndexedDB API interface (`db.ts`), ArcFace pre-processing (`arcfaceService.ts`), and offline sync orchestration (`syncService.ts`). |
| **`utils/`** | Independent Helper Functions | `faceQuality.ts` containing Laplacian variance (blur check), luminance (brightness check), and head angles math. |
| **`firestore.rules`** | Database Access Controls | Server-side security configuration file deployed to Firebase console. |

---

## ⚡ The Recognition Pipeline (Step-by-Step)

| Step | Phase | Operation | Technical Mechanism |
| :---: | :--- | :--- | :--- |
| **1** | **Camera Capture** | Binds input stream to rendering window | React assigns user webcam stream to an HTML5 `<video>` element with matching layout proportions. |
| **2** | **Face Detection** | Identifies faces in the stream | The `useFaceRecognition` hook throttles frames at 250ms and sends them to **MediaPipe Face Detector** WASM. |
| **3** | **Quality Check** | Filters out problematic samples | Coordinates and canvas crops are analyzed by `faceQuality.ts` using **Laplacian variance** (blur) and **relative luminance** (illumination). |
| **4** | **Square Crop** | Normalizes face crop dimensions | Finds the bounding box center, takes the max of `width` and `height` to form a square, adds **15% padding**, and draws to a `112x112` canvas. |
| **5** | **Biometric Math** | Computes face embedding vector | Canvas pixel values are normalized into `[-1, 1]` ranges and run through **ArcFace ONNX model** to generate a 512D float array. |
| **6** | **Roster Match** | Compares current scan against database | Calculates the dot product of the current embedding array with stored class student embeddings loaded in **IndexedDB**. |
| **7** | **Resolution** | Updates records and alerts user | If score is `> 0.65`, records a `present` state log, plays a double-note chime, fires screen confetti, and triggers background sync. |
