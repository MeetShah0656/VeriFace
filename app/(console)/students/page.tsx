"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { localDB, LocalStudent, LocalClass, LocalEmbedding } from "@/services/db";
import { db as firestoreDb } from "@/lib/firebase";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import {
  Loader2,
  Search,
  UserPlus,
  Trash2,
  Camera,
  Plus,
  CheckCircle2,
  AlertCircle,
  Users,
  ArrowUpDown,
} from "lucide-react";

interface StudentWithBiometrics extends LocalStudent {
  biometricsCount: number;
}

export default function StudentsPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const router = useRouter();

  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [students, setStudents] = useState<StudentWithBiometrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");

  // Create Student Modal
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentRoll, setNewStudentRoll] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");
  const [newStudentParent, setNewStudentParent] = useState("");
  const [newStudentNotes, setNewStudentNotes] = useState("");
  const [isStudentActionLoading, setIsStudentActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load classes and students
  const loadData = async () => {
    try {
      setIsLoading(true);
      const clsList = await localDB.getClasses();
      setClasses(clsList);

      const studList = await localDB.getStudents();
      const studentsWithStatus = await Promise.all(
        studList.map(async (student) => {
          const embeddings = await localDB.getEmbeddingsForStudent(student.id);
          return {
            ...student,
            biometricsCount: embeddings.length,
          };
        })
      );

      // Sort alphabetically by name
      setStudents(
        studentsWithStatus.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        )
      );

      if (clsList.length > 0) {
        setNewStudentClass(clsList[0].id);
      }
    } catch (e) {
      console.error("Failed to load students data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Student Creation
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentClass || !newStudentName.trim() || !newStudentRoll.trim()) return;
    setIsStudentActionLoading(true);
    setErrorMsg(null);

    // Check duplicate roll number locally inside the selected class
    const duplicate = students.find(
      (s) => s.class_id === newStudentClass && s.roll_number === newStudentRoll
    );
    if (duplicate) {
      setErrorMsg(`Roll number ${newStudentRoll} is already registered in this class.`);
      setIsStudentActionLoading(false);
      return;
    }

    const studentId = crypto.randomUUID();
    const studentObj: LocalStudent = {
      id: studentId,
      class_id: newStudentClass,
      roll_number: newStudentRoll,
      name: newStudentName,
      parent_contact: newStudentParent,
      notes: newStudentNotes,
      created_at: new Date().toISOString(),
    };

    try {
      // 1. Save locally in IndexedDB
      await localDB.saveStudents([studentObj]);

      // 2. Upload to Firestore if online (in the background, don't await)
      if (isOnline && user?.id !== "demo-teacher-uuid") {
        setDoc(doc(firestoreDb, "students", studentObj.id), {
          id: studentObj.id,
          class_id: studentObj.class_id,
          roll_number: studentObj.roll_number,
          name: studentObj.name,
          parent_contact: studentObj.parent_contact,
          notes: studentObj.notes,
          created_at: studentObj.created_at,
        }).catch((err) => {
          console.error("Firestore student upload failed:", err);
        });
      }

      setNewStudentName("");
      setNewStudentRoll("");
      setNewStudentParent("");
      setNewStudentNotes("");
      setShowStudentModal(false);

      // Refresh roster
      await loadData();

      // Prompt register face
      const confirmFace = window.confirm(
        `Student ${studentObj.name} added! Would you like to register face biometrics now?`
      );
      if (confirmFace) {
        router.push(`/students/register?student=${studentId}&class=${newStudentClass}`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to add student. Please try again.");
    } finally {
      setIsStudentActionLoading(false);
    }
  };

  // Handle Student Deletion
  const handleDeleteStudent = async (studentId: string, name: string) => {
    const check = window.confirm(
      `Are you sure you want to delete ${name}? This will permanently wipe their student profile and all saved face biometrics.`
    );
    if (!check) return;

    try {
      // 1. Delete in Firestore if online (in the background, don't await)
      if (isOnline && user?.id !== "demo-teacher-uuid") {
        // Delete student document
        deleteDoc(doc(firestoreDb, "students", studentId)).catch((err) => {
          console.error("Firestore student deletion failed:", err);
        });

        // Delete embeddings
        localDB.getEmbeddingsForStudent(studentId).then((embs) => {
          for (const emb of embs) {
            deleteDoc(doc(firestoreDb, "embeddings", emb.id)).catch(console.error);
          }
        });
      }

      // 2. Delete locally in IndexedDB
      await localDB.deleteStudent(studentId);

      // Refresh list
      await loadData();
    } catch (err) {
      console.error("Failed to delete student:", err);
      alert("Failed to delete student. Please try again.");
    }
  };

  // Filter students
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.roll_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClassFilter === "all" || s.class_id === selectedClassFilter;
    return matchesSearch && matchesClass;
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 h-[calc(100vh-140px)] overflow-hidden">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4 gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight font-sans">Students Directory</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage student profiles, monitor biometrics status, and enroll face templates.
          </p>
        </div>

        <button
          onClick={() => {
            if (classes.length === 0) {
              alert("Please create a class batch first before registering students.");
              return;
            }
            setShowStudentModal(true);
          }}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Student
        </button>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-muted-foreground uppercase font-sans whitespace-nowrap">
            Class Filter:
          </span>
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="w-full sm:w-48 text-sm bg-background border border-input rounded-md p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 border border-border rounded-xl bg-card overflow-y-auto">
        {filteredStudents.length > 0 ? (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 font-medium text-muted-foreground sticky top-0 bg-card z-10">
                <th className="p-4 w-20">Roll</th>
                <th className="p-4">Name</th>
                <th className="p-4">Class Batch</th>
                <th className="p-4">Biometrics Status</th>
                <th className="p-4 w-44 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((stud) => {
                const cls = classes.find((c) => c.id === stud.class_id);
                const hasBiometrics = stud.biometricsCount >= 10;

                return (
                  <tr
                    key={stud.id}
                    className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors"
                  >
                    <td className="p-4 font-semibold font-mono">{stud.roll_number}</td>
                    <td className="p-4 font-semibold">{stud.name}</td>
                    <td className="p-4 text-muted-foreground">{cls?.name || "Unknown Class"}</td>
                    <td className="p-4">
                      {hasBiometrics ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Complete (10/10)
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
                          {stud.biometricsCount > 0
                            ? `Incomplete (${stud.biometricsCount}/10)`
                            : "No Face Enrolled"}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() =>
                            router.push(`/students/register?student=${stud.id}&class=${stud.class_id}`)
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded transition-colors ${
                            hasBiometrics
                              ? "bg-muted text-foreground hover:bg-muted/80"
                              : "bg-primary text-primary-foreground hover:bg-primary/95"
                          }`}
                          title={hasBiometrics ? "Update Face Profile" : "Scan Face Biometrics"}
                        >
                          <Camera className="h-3.5 w-3.5" />
                          {hasBiometrics ? "Re-scan" : "Scan Face"}
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(stud.id, stud.name)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-red-500 transition-colors"
                          title="Delete Student Profile"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-bold text-lg font-sans">No Students Found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              No profiles match your search criteria. Create a new student by clicking the button above.
            </p>
          </div>
        )}
      </div>

      {/* Student Create Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-lg">
            <h3 className="text-lg font-bold font-sans mb-4">Register Student Profile</h3>

            <form onSubmit={handleCreateStudent} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Class Batch</label>
                <select
                  required
                  value={newStudentClass}
                  onChange={(e) => setNewStudentClass(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1 col-span-1">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Roll Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 01"
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meet Shah"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Parent Contact</label>
                <input
                  type="text"
                  placeholder="e.g. +919876543210 (Optional)"
                  value={newStudentParent}
                  onChange={(e) => setNewStudentParent(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Notes / Remarks</label>
                <textarea
                  placeholder="e.g. Needs physical assistance (Optional)"
                  value={newStudentNotes}
                  onChange={(e) => setNewStudentNotes(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-16 resize-none"
                />
              </div>

              {errorMsg && <div className="text-xs text-red-500 font-semibold">{errorMsg}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStudentModal(false);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2 rounded text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStudentActionLoading}
                  className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center disabled:opacity-50"
                >
                  {isStudentActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
