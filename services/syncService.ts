import { auth, db } from "@/lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import { localDB, LocalClass, LocalStudent, LocalSession, LocalRecord } from "./db";

let isSyncing = false;

// Helper to check if Firebase is configured with actual values
const isFirebaseConfigured = () => {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== "your-firebase-api-key"
  );
};

export const syncService = {
  async syncOfflineData(): Promise<{ success: boolean; syncedSessions: number; syncedRecords: number }> {
    if (typeof window === "undefined" || !navigator.onLine || !isFirebaseConfigured()) {
      return { success: false, syncedSessions: 0, syncedRecords: 0 };
    }

    const activeUid = auth.currentUser?.uid;
    // Prevent syncing if the user is not signed in to a real Firebase account
    if (!activeUid || activeUid === "demo-teacher-uuid") {
      return { success: false, syncedSessions: 0, syncedRecords: 0 };
    }

    if (isSyncing) {
      return { success: false, syncedSessions: 0, syncedRecords: 0 };
    }

    isSyncing = true;
    let syncedSessions = 0;
    let syncedRecords = 0;

    try {
      // 1. Fetch Unsynced Sessions & Records
      const unsyncedSessions = await localDB.getUnsyncedSessions();
      const unsyncedRecords = await localDB.getUnsyncedRecords();

      if (unsyncedSessions.length === 0 && unsyncedRecords.length === 0) {
        isSyncing = false;
        return { success: true, syncedSessions: 0, syncedRecords: 0 };
      }

      // Firestore allows up to 500 operations in a writeBatch.
      // We will perform chunked batch updates.
      const BATCH_LIMIT = 400;
      let batch = writeBatch(db);
      let opCount = 0;

      const sessionsToMark: LocalSession[] = [];
      const recordsToMark: LocalRecord[] = [];

      // Add sessions to batch
      for (const session of unsyncedSessions) {
        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }

        const sessionRef = doc(db, "attendance_sessions", session.id);
        const teacherId = session.teacher_id === "demo-teacher-uuid" ? activeUid : session.teacher_id;
        batch.set(sessionRef, {
          id: session.id,
          class_id: session.class_id,
          teacher_id: teacherId,
          date: session.date,
          created_at: session.created_at,
        });

        sessionsToMark.push({ ...session, synced: true });
        syncedSessions++;
        opCount++;
      }

      // Add records to batch
      for (const record of unsyncedRecords) {
        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }

        const recordRef = doc(db, "attendance_records", record.id);
        batch.set(recordRef, {
          id: record.id,
          session_id: record.session_id,
          student_id: record.student_id,
          status: record.status,
          arrival_time: record.arrival_time,
          confidence: record.confidence,
          created_at: record.created_at,
        });

        recordsToMark.push({ ...record, synced: true });
        syncedRecords++;
        opCount++;
      }

      // Commit remaining batch
      if (opCount > 0) {
        await batch.commit();
      }

      // 2. Mark local sessions and records as synced
      if (sessionsToMark.length > 0) {
        for (const s of sessionsToMark) {
          await localDB.saveSession(s);
        }
      }
      if (recordsToMark.length > 0) {
        await localDB.saveRecords(recordsToMark);
      }

      // 3. Clean up older synced local logs to save IndexedDB space
      if (syncedSessions > 0 || syncedRecords > 0) {
        await localDB.clearSyncedData();
      }

      return { success: true, syncedSessions, syncedRecords };
    } catch (err) {
      console.error("Sync error occurred:", err);
      return { success: false, syncedSessions, syncedRecords };
    } finally {
      isSyncing = false;
    }
  },

  // Initialize listener for online state changes
  initSyncListener(onSyncComplete?: (syncedSessions: number, syncedRecords: number) => void) {
    if (typeof window === "undefined") return () => {};

    const handleOnline = async () => {
      console.log("Device online. Starting automatic sync...");
      const result = await this.syncOfflineData();
      if (result.success && (result.syncedSessions > 0 || result.syncedRecords > 0)) {
        if (onSyncComplete) {
          onSyncComplete(result.syncedSessions, result.syncedRecords);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    
    // Trigger sync once on initialization in case we are already online
    if (navigator.onLine) {
      handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  },

  async pullCloudData(): Promise<{ success: boolean }> {
    if (typeof window === "undefined" || !navigator.onLine || !isFirebaseConfigured()) {
      return { success: false };
    }

    const activeUid = auth.currentUser?.uid;
    if (!activeUid || activeUid === "demo-teacher-uuid") {
      return { success: false };
    }

    try {
      const { collection, query, where, getDocs } = await import("firebase/firestore");

      // 1. Pull Classes
      const classesQuery = query(collection(db, "classes"), where("teacher_id", "==", activeUid));
      const classesSnapshot = await getDocs(classesQuery);
      const classesList: LocalClass[] = [];
      classesSnapshot.forEach((doc) => {
        classesList.push(doc.data() as LocalClass);
      });

      if (classesList.length > 0) {
        await localDB.saveClasses(classesList);

        // 2. Pull Students for each Class
        for (const cls of classesList) {
          const studentsQuery = query(collection(db, "students"), where("class_id", "==", cls.id));
          const studentsSnapshot = await getDocs(studentsQuery);
          const studentsList: LocalStudent[] = [];
          studentsSnapshot.forEach((doc) => {
            studentsList.push(doc.data() as LocalStudent);
          });

          if (studentsList.length > 0) {
            await localDB.saveStudents(studentsList);

            // 3. Pull Face Embeddings for each Student
            for (const stud of studentsList) {
              const embeddingsQuery = query(
                collection(db, "face_embeddings"),
                where("student_id", "==", stud.id)
              );
              const embeddingsSnapshot = await getDocs(embeddingsQuery);
              const embeddingsList: any[] = [];
              embeddingsSnapshot.forEach((doc) => {
                embeddingsList.push(doc.data());
              });

              if (embeddingsList.length > 0) {
                await localDB.saveEmbeddings(embeddingsList);
              }
            }
          }

          // 4. Pull Sessions
          const sessionsQuery = query(
            collection(db, "attendance_sessions"),
            where("class_id", "==", cls.id)
          );
          const sessionsSnapshot = await getDocs(sessionsQuery);
          const sessionsList: LocalSession[] = [];
          sessionsSnapshot.forEach((doc) => {
            sessionsList.push({ ...(doc.data() as LocalSession), synced: true });
          });

          if (sessionsList.length > 0) {
            for (const s of sessionsList) {
              await localDB.saveSession(s);

              // 5. Pull Records for each Session
              const recordsQuery = query(
                collection(db, "attendance_records"),
                where("session_id", "==", s.id)
              );
              const recordsSnapshot = await getDocs(recordsQuery);
              const recordsList: LocalRecord[] = [];
              recordsSnapshot.forEach((doc) => {
                recordsList.push({ ...(doc.data() as LocalRecord), synced: true });
              });

              if (recordsList.length > 0) {
                await localDB.saveRecords(recordsList);
              }
            }
          }
        }
      }

      console.log("Firestore cloud data downloaded and synced locally!");
      return { success: true };
    } catch (e) {
      console.error("Failed to pull cloud data:", e);
      return { success: false };
    }
  },
};
