"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-provider";
import { Camera, ShieldCheck, WifiOff, BarChart3, Sun, Moon, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  const { enterDemoMode, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  const handleDemoMode = () => {
    enterDemoMode();
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Camera className="h-5 w-5" />
            </div>
            <span className="font-sans font-bold text-xl tracking-tight">VeriFace</span>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 hover:bg-muted text-muted-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign In
                </Link>
                <button
                  onClick={handleDemoMode}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                >
                  Try Demo
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-20 md:py-32 px-6">
          <div className="container mx-auto max-w-4xl text-center flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground bg-muted/40 mb-6"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
              <span>Biometric Attendance Pipeline</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl font-sans"
            >
              Attendance.<br />
              <span className="text-muted-foreground">Verified.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground font-sans leading-relaxed"
            >
              Secure, high-accuracy facial recognition attendance for schools, classes, and NGOs. Works completely offline on any teacher device. No student phones required.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
            >
              <button
                onClick={handleDemoMode}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-8 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                Launch Instant Demo <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-8 text-base font-medium hover:bg-muted transition-colors"
              >
                Sign In with Firebase
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 bg-muted/40 border-t border-b border-border px-6">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-center font-sans font-bold text-3xl tracking-tight mb-16">
              Production-Ready Biometric Features
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="flex flex-col gap-3 rounded-lg border border-border p-6 bg-background">
                <div className="h-10 w-10 flex items-center justify-center rounded-md bg-primary/5 text-primary">
                  <Camera className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg font-sans">Edge AI Pipeline</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  MediaPipe face detection and ONNX ArcFace embeddings running entirely client-side inside the browser.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-6 bg-background">
                <div className="h-10 w-10 flex items-center justify-center rounded-md bg-primary/5 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg font-sans">Angle Verification</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Head pose feedback ensures teachers capture Front, Left, Right, Up, and Down angles during registration.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-6 bg-background">
                <div className="h-10 w-10 flex items-center justify-center rounded-md bg-primary/5 text-primary">
                  <WifiOff className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg font-sans">100% Offline Cache</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  All biometrics, students, and sessions reside in local IndexedDB. Scans work with zero active internet.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-6 bg-background">
                <div className="h-10 w-10 flex items-center justify-center rounded-md bg-primary/5 text-primary">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg font-sans">Reports & Export</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Review metrics (attendance rates, status updates) and export data to PDF, CSV, or Excel formats.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 text-center text-sm text-muted-foreground bg-background">
        <div className="container mx-auto">
          <p>© {new Date().getFullYear()} VeriFace Attendance Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
