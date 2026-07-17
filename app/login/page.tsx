"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Camera, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const { signIn, signUp, enterDemoMode, isDemoMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!name) {
          setErrorMsg("Name is required");
          setIsLoading(false);
          return;
        }
        const { error } = await signUp(email, password, name);
        if (error) {
          setErrorMsg(error.message);
        } else {
          router.push("/dashboard");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setErrorMsg(error.message);
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectDemo = () => {
    enterDemoMode();
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 transition-colors duration-300">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Camera className="h-6 w-6" />
            </div>
            <span className="font-sans font-bold text-2xl tracking-tight">VeriFace</span>
          </Link>
          <h2 className="text-3xl font-bold tracking-tight font-sans">
            {isSignUp ? "Create your account" : "Sign in to VeriFace"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp ? "Start managing your class attendance today" : "Enter your email credentials to access your console"}
          </p>
        </div>

        {/* Demo Mode Notice */}
        {isDemoMode && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-600 dark:text-yellow-400">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Firebase Not Configured</span>
                <p>Operating in local offline **Demo Mode**.</p>
                <p className="mt-2 text-xs">
                  Credentials: <strong className="font-mono">demo@veriface.app</strong> / <strong className="font-mono">demo123</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Auth Card */}
        <div className="border border-border rounded-xl bg-card p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMsg && (
              <div className="rounded-md bg-destructive/15 p-4 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {isSignUp && (
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-semibold">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait...
                </>
              ) : isSignUp ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Toggle authentication mode */}
          <div className="mt-6 text-center text-sm">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg(null);
              }}
              className="text-muted-foreground hover:text-foreground underline transition-colors"
            >
              {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>

        {/* Quick Demo Login Option */}
        <div className="text-center">
          <button
            onClick={handleDirectDemo}
            className="text-xs text-muted-foreground hover:text-foreground font-semibold py-2 px-4 rounded border border-dashed border-border hover:bg-muted transition-all"
          >
            Enter Demo Mode Directly (No Login Required)
          </button>
        </div>
      </div>
    </div>
  );
}
