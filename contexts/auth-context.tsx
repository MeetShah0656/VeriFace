"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface AuthContextType {
  user: any | null; // Keep as any for compatibility across types
  session: any | null;
  loading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  enterDemoMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to check if Firebase is configured with actual values
const isFirebaseConfigured = () => {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== "your-firebase-api-key"
  );
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // Auto-enter demo mode if no Firebase credentials exist
      setIsDemoMode(true);
      setLoading(false);
      
      // Load demo user if persisted
      const savedDemoUser = localStorage.getItem("veriface-demo-user");
      if (savedDemoUser) {
        setUser(JSON.parse(savedDemoUser));
      }
      return;
    }

    // Subscribe to Firebase Auth state changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Map Firebase User fields to format used in views
        setUser({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          user_metadata: { name: firebaseUser.displayName || "Teacher" },
          created_at: firebaseUser.metadata.creationTime,
        });
        setIsDemoMode(false);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      if (email === "demo@veriface.app" && password === "demo123") {
        const demoUser = {
          id: "demo-teacher-uuid",
          email: "demo@veriface.app",
          user_metadata: { name: "Demo Teacher" },
          created_at: new Date().toISOString(),
        } as any;
        setUser(demoUser);
        localStorage.setItem("veriface-demo-user", JSON.stringify(demoUser));
        return { error: null };
      }
      return { error: { message: "Invalid demo credentials. Use demo@veriface.app / demo123" } };
    }

    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      setUser({
        id: res.user.uid,
        uid: res.user.uid,
        email: res.user.email,
        user_metadata: { name: res.user.displayName || "Teacher" },
        created_at: res.user.metadata.creationTime,
      });
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    if (isDemoMode) {
      const demoUser = {
        id: "demo-teacher-uuid",
        email,
        user_metadata: { name },
        created_at: new Date().toISOString(),
      } as any;
      setUser(demoUser);
      localStorage.setItem("veriface-demo-user", JSON.stringify(demoUser));
      return { error: null };
    }

    try {
      // 1. Create User in Firebase Auth
      const res = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Set display name in profile
      await updateProfile(res.user, { displayName: name });

      // 3. Write Teacher profile document to Cloud Firestore
      await setDoc(doc(db, "teachers", res.user.uid), {
        id: res.user.uid,
        email: res.user.email,
        name: name,
        created_at: new Date().toISOString(),
      });

      // 4. Write default Settings document to Cloud Firestore
      await setDoc(doc(db, "settings", res.user.uid), {
        teacher_id: res.user.uid,
        theme: "dark",
        recognition_threshold: 0.65,
        attendance_sound: true,
        language: "en",
        updated_at: new Date().toISOString(),
      });

      setUser({
        id: res.user.uid,
        uid: res.user.uid,
        email: res.user.email,
        user_metadata: { name },
        created_at: res.user.metadata.creationTime,
      });

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    // Clear local database caches asynchronously on logout
    import("@/services/db").then(({ localDB }) => {
      localDB.clearAllData().catch(console.error);
    });

    if (isDemoMode) {
      setUser(null);
      localStorage.removeItem("veriface-demo-user");
      return { error: null };
    }

    try {
      await firebaseSignOut(auth);
      setUser(null);
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const enterDemoMode = () => {
    setIsDemoMode(true);
    const demoUser = {
      id: "demo-teacher-uuid",
      email: "demo@veriface.app",
      user_metadata: { name: "Demo Teacher" },
      created_at: new Date().toISOString(),
    } as any;
    setUser(demoUser);
    localStorage.setItem("veriface-demo-user", JSON.stringify(demoUser));

    // Seed demo data asynchronously in the browser
    import("@/services/db").then(({ localDB }) => {
      localDB.seedDemoData().catch(console.error);
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session: null, // Left as null for cross-compatibility
        loading,
        isDemoMode,
        signIn,
        signUp,
        signOut,
        enterDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
