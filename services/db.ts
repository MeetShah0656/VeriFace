import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface LocalClass {
  id: string;
  teacher_id: string;
  name: string;
  description?: string;
  archived: boolean;
  created_at: string;
}

export interface LocalStudent {
  id: string;
  class_id: string;
  roll_number: string;
  name: string;
  parent_contact?: string;
  notes?: string;
  created_at: string;
}

export interface LocalEmbedding {
  id: string;
  student_id: string;
  embedding: number[]; // Array of 512 dimensions
  angle: string;
  created_at: string;
}

export interface LocalSession {
  id: string;
  class_id: string;
  teacher_id: string;
  date: string;
  created_at: string;
  synced: boolean;
}

export interface LocalRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: "present" | "absent" | "late" | "excused";
  arrival_time: string | null;
  confidence: number;
  created_at: string;
  synced: boolean;
}

export interface LocalSettings {
  teacher_id: string;
  theme: string;
  camera_id?: string;
  recognition_threshold: number;
  attendance_sound: boolean;
  language: string;
}

interface VeriFaceDB extends DBSchema {
  classes: {
    key: string;
    value: LocalClass;
  };
  students: {
    key: string;
    value: LocalStudent;
    indexes: { "by-class": string };
  };
  embeddings: {
    key: string;
    value: LocalEmbedding;
    indexes: { "by-student": string };
  };
  sessions: {
    key: string;
    value: LocalSession;
    indexes: { "by-class": string };
  };
  records: {
    key: string;
    value: LocalRecord;
    indexes: { "by-session": string };
  };
  settings: {
    key: string;
    value: LocalSettings;
  };
}

let dbPromise: Promise<IDBPDatabase<VeriFaceDB>> | null = null;

function getDB(): Promise<IDBPDatabase<VeriFaceDB>> {
  if (typeof window === "undefined") {
    // Return a dummy promise during SSR
    return new Promise(() => {});
  }

  if (!dbPromise) {
    dbPromise = openDB<VeriFaceDB>("veriface-local-db", 1, {
      upgrade(db) {
        // Classes Store
        if (!db.objectStoreNames.contains("classes")) {
          db.createObjectStore("classes", { keyPath: "id" });
        }

        // Students Store
        if (!db.objectStoreNames.contains("students")) {
          const studentStore = db.createObjectStore("students", { keyPath: "id" });
          studentStore.createIndex("by-class", "class_id");
        }

        // Embeddings Store
        if (!db.objectStoreNames.contains("embeddings")) {
          const embeddingStore = db.createObjectStore("embeddings", { keyPath: "id" });
          embeddingStore.createIndex("by-student", "student_id");
        }

        // Sessions Store
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionStore = db.createObjectStore("sessions", { keyPath: "id" });
          sessionStore.createIndex("by-class", "class_id");
        }

        // Records Store
        if (!db.objectStoreNames.contains("records")) {
          const recordStore = db.createObjectStore("records", { keyPath: "id" });
          recordStore.createIndex("by-session", "session_id");
        }

        // Settings Store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "teacher_id" });
        }
      },
    });
  }

  return dbPromise;
}

export const localDB = {
  // --- Classes ---
  async saveClasses(classes: LocalClass[]) {
    const db = await getDB();
    const tx = db.transaction("classes", "readwrite");
    await Promise.all([
      ...classes.map((c) => tx.store.put(c)),
      tx.done,
    ]);
  },

  async getClass(id: string): Promise<LocalClass | undefined> {
    const db = await getDB();
    return db.get("classes", id);
  },

  async getClasses(): Promise<LocalClass[]> {
    const db = await getDB();
    return db.getAll("classes");
  },

  async deleteClass(classId: string) {
    const db = await getDB();
    
    // 1. Delete class
    await db.delete("classes", classId);

    // 2. Fetch and delete students & embeddings
    const students = await db.getAllFromIndex("students", "by-class", classId);
    for (const student of students) {
      // Delete student embeddings
      const embeddings = await db.getAllFromIndex("embeddings", "by-student", student.id);
      for (const emb of embeddings) {
        await db.delete("embeddings", emb.id);
      }
      // Delete student
      await db.delete("students", student.id);
    }

    // 3. Fetch and delete sessions & records
    const sessions = await db.getAllFromIndex("sessions", "by-class", classId);
    for (const session of sessions) {
      // Delete session records
      const records = await db.getAllFromIndex("records", "by-session", session.id);
      for (const rec of records) {
        await db.delete("records", rec.id);
      }
      // Delete session
      await db.delete("sessions", session.id);
    }
  },

  // --- Students ---
  async saveStudents(students: LocalStudent[]) {
    const db = await getDB();
    const tx = db.transaction("students", "readwrite");
    await Promise.all([
      ...students.map((s) => tx.store.put(s)),
      tx.done,
    ]);
  },

  async getStudentsByClass(classId: string): Promise<LocalStudent[]> {
    const db = await getDB();
    return db.getAllFromIndex("students", "by-class", classId);
  },

  async getStudent(id: string): Promise<LocalStudent | undefined> {
    const db = await getDB();
    return db.get("students", id);
  },

  async getStudents(): Promise<LocalStudent[]> {
    const db = await getDB();
    return db.getAll("students");
  },

  async deleteStudent(studentId: string) {
    const db = await getDB();
    
    // 1. Delete student profile
    await db.delete("students", studentId);

    // 2. Fetch and delete student embeddings
    const embeddings = await db.getAllFromIndex("embeddings", "by-student", studentId);
    for (const emb of embeddings) {
      await db.delete("embeddings", emb.id);
    }
  },

  // --- Embeddings ---
  async saveEmbeddings(embeddings: LocalEmbedding[]) {
    const db = await getDB();
    const tx = db.transaction("embeddings", "readwrite");
    await Promise.all([
      ...embeddings.map((e) => tx.store.put(e)),
      tx.done,
    ]);
  },

  async getEmbeddingsForStudent(studentId: string): Promise<LocalEmbedding[]> {
    const db = await getDB();
    return db.getAllFromIndex("embeddings", "by-student", studentId);
  },

  async getEmbeddingsForClass(classId: string): Promise<{ student: LocalStudent; embeddings: LocalEmbedding[] }[]> {
    const db = await getDB();
    const students = await this.getStudentsByClass(classId);
    const result = await Promise.all(
      students.map(async (student) => {
        const embeddings = await db.getAllFromIndex("embeddings", "by-student", student.id);
        return { student, embeddings };
      })
    );
    return result;
  },

  // --- Attendance Sessions ---
  async saveSession(session: LocalSession) {
    const db = await getDB();
    await db.put("sessions", session);
  },

  async getSessions(): Promise<LocalSession[]> {
    const db = await getDB();
    return db.getAll("sessions");
  },

  async getUnsyncedSessions(): Promise<LocalSession[]> {
    const db = await getDB();
    const sessions = await db.getAll("sessions");
    return sessions.filter((s) => !s.synced);
  },

  async deleteSession(id: string) {
    const db = await getDB();
    await db.delete("sessions", id);
  },

  // --- Attendance Records ---
  async saveRecords(records: LocalRecord[]) {
    const db = await getDB();
    const tx = db.transaction("records", "readwrite");
    await Promise.all([
      ...records.map((r) => tx.store.put(r)),
      tx.done,
    ]);
  },

  async getRecordsBySession(sessionId: string): Promise<LocalRecord[]> {
    const db = await getDB();
    return db.getAllFromIndex("records", "by-session", sessionId);
  },

  async getUnsyncedRecords(): Promise<LocalRecord[]> {
    const db = await getDB();
    const records = await db.getAll("records");
    return records.filter((r) => !r.synced);
  },

  async deleteRecord(id: string) {
    const db = await getDB();
    await db.delete("records", id);
  },

  // --- Settings ---
  async saveSettings(settings: LocalSettings) {
    const db = await getDB();
    await db.put("settings", settings);
  },

  async getSettings(teacherId: string): Promise<LocalSettings | undefined> {
    const db = await getDB();
    return db.get("settings", teacherId);
  },

  // --- Sync Utility ---
  async clearSyncedData() {
    const db = await getDB();
    
    // Clean up sessions that are synced
    const sessionsTx = db.transaction("sessions", "readwrite");
    const sessions = await sessionsTx.store.getAll();
    await Promise.all(
      sessions.filter((s) => s.synced).map((s) => sessionsTx.store.delete(s.id))
    );
    await sessionsTx.done;

    // Clean up records that are synced
    const recordsTx = db.transaction("records", "readwrite");
    const records = await recordsTx.store.getAll();
    await Promise.all(
      records.filter((r) => r.synced).map((r) => recordsTx.store.delete(r.id))
    );
    await recordsTx.done;
  },

  async seedDemoData() {
    const db = await getDB();
    const existingClasses = await db.getAll("classes");
    if (existingClasses.length > 0) return; // Already seeded or has actual data

    const teacherId = "demo-teacher-uuid";

    // 1. Seed Classes
    const classes: LocalClass[] = [
      { id: "c1", teacher_id: teacherId, name: "Grade 12 - Science", archived: false, created_at: new Date().toISOString() },
      { id: "c2", teacher_id: teacherId, name: "Grade 11 - Commerce", archived: false, created_at: new Date().toISOString() },
      { id: "c3", teacher_id: teacherId, name: "Morning Coding Batch", archived: false, created_at: new Date().toISOString() },
    ];

    // 2. Seed Students
    const students: LocalStudent[] = [
      { id: "s1", class_id: "c1", roll_number: "01", name: "Meet Shah", parent_contact: "+919876543210", created_at: new Date().toISOString() },
      { id: "s2", class_id: "c1", roll_number: "02", name: "Yash Patel", parent_contact: "+919876543211", created_at: new Date().toISOString() },
      { id: "s3", class_id: "c1", roll_number: "03", name: "Het Vaghela", parent_contact: "+919876543212", created_at: new Date().toISOString() },
      { id: "s4", class_id: "c2", roll_number: "101", name: "Aagam Shah", parent_contact: "+919876543213", created_at: new Date().toISOString() },
      { id: "s5", class_id: "c2", roll_number: "102", name: "Mahek Patel", parent_contact: "+919876543214", created_at: new Date().toISOString() },
      { id: "s6", class_id: "c3", roll_number: "B1", name: "Rinal Shah", parent_contact: "+919876543215", created_at: new Date().toISOString() },
    ];

    // 3. Seed Sessions & Attendance Records (last 5 days)
    const sessions: LocalSession[] = [];
    const records: LocalRecord[] = [];

    const statuses: ("present" | "absent" | "late" | "excused")[][] = [
      ["present", "present", "present"], // day 1: all present
      ["present", "late", "present"],    // day 2: 1 late
      ["present", "absent", "present"],  // day 3: 1 absent
      ["present", "present", "late"],    // day 4: 1 late
      ["present", "present", "present"], // day 5: all present
    ];

    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const sessionId = `sess-${i}`;

      sessions.push({
        id: sessionId,
        class_id: "c1",
        teacher_id: teacherId,
        date: dateStr,
        created_at: new Date(date).toISOString(),
        synced: false,
      });

      const dayStatuses = statuses[i % statuses.length];
      const studentIds = ["s1", "s2", "s3"];

      for (let j = 0; j < studentIds.length; j++) {
        const arrivalTime = dayStatuses[j] === "present" || dayStatuses[j] === "late"
          ? new Date(new Date(date).setHours(9, j === 1 && i === 1 ? 25 : 5, 0)).toISOString()
          : null;

        records.push({
          id: `rec-${i}-${j}`,
          session_id: sessionId,
          student_id: studentIds[j],
          status: dayStatuses[j],
          arrival_time: arrivalTime,
          confidence: 0.85 + Math.random() * 0.12,
          created_at: new Date(date).toISOString(),
          synced: false,
        });
      }
    }

    // Default settings
    const settings: LocalSettings = {
      teacher_id: teacherId,
      theme: "dark",
      recognition_threshold: 0.65,
      attendance_sound: true,
      language: "en",
    };

    // Save all to store
    const classesTx = db.transaction("classes", "readwrite");
    await Promise.all([...classes.map((c) => classesTx.store.put(c)), classesTx.done]);

    const studentsTx = db.transaction("students", "readwrite");
    await Promise.all([...students.map((s) => studentsTx.store.put(s)), studentsTx.done]);

    const sessionsTx = db.transaction("sessions", "readwrite");
    await Promise.all([...sessions.map((s) => sessionsTx.store.put(s)), sessionsTx.done]);

    const recordsTx = db.transaction("records", "readwrite");
    await Promise.all([...records.map((r) => recordsTx.store.put(r)), recordsTx.done]);

    await db.put("settings", settings);
    console.log("Demo data successfully seeded in IndexedDB!");
  },

  async clearAllData() {
    const db = await getDB();
    const stores: ("classes" | "students" | "embeddings" | "sessions" | "records" | "settings")[] = [
      "classes",
      "students",
      "embeddings",
      "sessions",
      "records",
      "settings"
    ];
    for (const store of stores) {
      const tx = db.transaction(store, "readwrite");
      await tx.store.clear();
      await tx.done;
    }
    console.log("Local IndexedDB wiped successfully!");
  },
};
