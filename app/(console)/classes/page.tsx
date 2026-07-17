"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { localDB, LocalClass, LocalStudent, LocalSession, LocalRecord } from "@/services/db";
import { db as firestoreDb } from "@/lib/firebase";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import {
  Plus,
  BookOpen,
  Users,
  Play,
  UserPlus,
  Trash2,
  Archive,
  Download,
  AlertCircle,
  Loader2,
  History,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";

export default function ClassesPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const router = useRouter();

  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<LocalClass | null>(null);
  const [students, setStudents] = useState<LocalStudent[]>([]);
  const [historySessions, setHistorySessions] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isClassActionLoading, setIsClassActionLoading] = useState(false);
  const [isStudentActionLoading, setIsStudentActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals/Forms State
  const [showClassModal, setShowClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassDesc, setNewClassDesc] = useState("");

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentRoll, setNewStudentRoll] = useState("");
  const [newStudentParent, setNewStudentParent] = useState("");
  const [newStudentNotes, setNewStudentNotes] = useState("");

  const fetchClasses = async () => {
    try {
      setIsLoading(true);
      const classesData = await localDB.getClasses();
      setClasses(classesData);
      if (classesData.length > 0 && !selectedClass) {
        setSelectedClass(classesData[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [user]);

  // Load details whenever selected class changes
  useEffect(() => {
    async function loadClassDetails() {
      if (!selectedClass) return;
      try {
        // Load students
        const studentsData = await localDB.getStudentsByClass(selectedClass.id);
        setStudents(studentsData.sort((a, b) => a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true })));

        // Load sessions for history
        const allSessions = await localDB.getSessions();
        const classSessions = allSessions
          .filter((s) => s.class_id === selectedClass.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const sessionsDetails = await Promise.all(
          classSessions.map(async (sess) => {
            const recs = await localDB.getRecordsBySession(sess.id);
            const present = recs.filter((r) => r.status === "present" || r.status === "late").length;
            return {
              ...sess,
              presentCount: present,
              totalCount: recs.length,
              rate: recs.length > 0 ? Math.round((present / recs.length) * 100) : 0,
            };
          })
        );
        setHistorySessions(sessionsDetails);
      } catch (e) {
        console.error(e);
      }
    }

    loadClassDetails();
  }, [selectedClass]);

  // Handle Class Creation
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setIsClassActionLoading(true);
    setErrorMsg(null);

    const newId = crypto.randomUUID();
    const classObj: LocalClass = {
      id: newId,
      teacher_id: user?.id || "demo-teacher-uuid",
      name: newClassName,
      description: newClassDesc,
      archived: false,
      created_at: new Date().toISOString(),
    };

    try {
      // 1. Save locally in IndexedDB
      await localDB.saveClasses([classObj]);

      // 2. Upload to Firestore if online (in the background, don't await)
      if (isOnline && user?.id !== "demo-teacher-uuid") {
        setDoc(doc(firestoreDb, "classes", classObj.id), {
          id: classObj.id,
          teacher_id: classObj.teacher_id,
          name: classObj.name,
          description: classObj.description,
          archived: classObj.archived,
          created_at: classObj.created_at,
        }).catch((err) => {
          console.error("Firestore class upload failed:", err);
        });
      }

      setNewClassName("");
      setNewClassDesc("");
      setShowClassModal(false);
      
      // Refresh list
      const updated = await localDB.getClasses();
      setClasses(updated);
      setSelectedClass(classObj);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to create class. Please try again.");
    } finally {
      setIsClassActionLoading(false);
    }
  };

  // Handle Student Creation
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !newStudentName.trim() || !newStudentRoll.trim()) return;
    setIsStudentActionLoading(true);
    setErrorMsg(null);

    // Check duplicate roll number locally
    const duplicate = students.find((s) => s.roll_number === newStudentRoll);
    if (duplicate) {
      setErrorMsg(`Roll number ${newStudentRoll} is already registered in this class.`);
      setIsStudentActionLoading(false);
      return;
    }

    const studentId = crypto.randomUUID();
    const studentObj: LocalStudent = {
      id: studentId,
      class_id: selectedClass.id,
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

      // Refresh student list
      const updated = await localDB.getStudentsByClass(selectedClass.id);
      setStudents(updated.sort((a, b) => a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true })));

      // Prompt register face
      const confirmFace = window.confirm(`Student ${studentObj.name} added! Would you like to register face biometrics now?`);
      if (confirmFace) {
        router.push(`/students/register?student=${studentId}&class=${selectedClass.id}`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to add student. Please try again.");
    } finally {
      setIsStudentActionLoading(false);
    }
  };

  // Handle Class Delete
  const handleDeleteClass = async (classId: string) => {
    const check = window.confirm("Are you absolutely sure you want to delete this class? This will permanently delete all associated students, face biometrics, and attendance logs.");
    if (!check) return;

    try {
      // 1. Delete in Firestore if online (in the background, don't await)
      if (isOnline && user?.id !== "demo-teacher-uuid") {
        // Delete class document
        deleteDoc(doc(firestoreDb, "classes", classId)).catch((err) => {
          console.error("Firestore class deletion failed:", err);
        });

        // Fetch local students and delete their firestore profiles/embeddings
        localDB.getStudentsByClass(classId).then((studentsToDelete) => {
          for (const s of studentsToDelete) {
            deleteDoc(doc(firestoreDb, "students", s.id)).catch(console.error);
            localDB.getEmbeddingsForStudent(s.id).then((embs) => {
              for (const emb of embs) {
                deleteDoc(doc(firestoreDb, "embeddings", emb.id)).catch(console.error);
              }
            });
          }
        });

        // Fetch local sessions and delete their firestore records/sessions
        localDB.getSessions().then((allSessions) => {
          const classSessions = allSessions.filter((s) => s.class_id === classId);
          for (const sess of classSessions) {
            deleteDoc(doc(firestoreDb, "sessions", sess.id)).catch(console.error);
            localDB.getRecordsBySession(sess.id).then((recs) => {
              for (const rec of recs) {
                deleteDoc(doc(firestoreDb, "records", rec.id)).catch(console.error);
              }
            });
          }
        });
      }

      // 2. Delete locally in IndexedDB (this will cascadingly delete class, students, embeddings, sessions, records)
      await localDB.deleteClass(classId);

      const updated = classes.filter((c) => c.id !== classId);
      setClasses(updated);
      setSelectedClass(updated.length > 0 ? updated[0] : null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete class. Please try again.");
    }
  };

  // Export Attendance Sheet to Excel
  const handleExportExcel = async () => {
    if (!selectedClass || students.length === 0 || historySessions.length === 0) {
      alert("No attendance data available to export.");
      return;
    }

    try {
      // 1. Fetch all records for our history sessions
      const matrixData: any[] = [];

      // Sort dates chronologically
      const sortedHistory = [...historySessions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      for (const student of students) {
        const row: any = {
          "Roll Number": student.roll_number,
          "Student Name": student.name,
          "Parent Contact": student.parent_contact || "N/A",
        };

        let presentDays = 0;
        let lateDays = 0;

        for (const session of sortedHistory) {
          const records = await localDB.getRecordsBySession(session.id);
          const record = records.find((r) => r.student_id === student.id);
          
          let statusLabel = "Absent";
          if (record) {
            if (record.status === "present") {
              statusLabel = "Present";
              presentDays++;
            } else if (record.status === "late") {
              statusLabel = "Late";
              lateDays++;
            } else if (record.status === "excused") {
              statusLabel = "Excused";
            }
          }
          row[session.date] = statusLabel;
        }

        row["Total Present"] = presentDays;
        row["Total Late"] = lateDays;
        row["Attendance Rate"] = `${Math.round(((presentDays + lateDays) / sortedHistory.length) * 100)}%`;

        matrixData.push(row);
      }

      // Create Excel Worksheet
      const worksheet = XLSX.utils.json_to_sheet(matrixData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");

      // Generate buffer and trigger download
      XLSX.writeFile(workbook, `Attendance_Report_${selectedClass.name.replace(/\s+/g, "_")}.xlsx`);
    } catch (e) {
      console.error("Export error:", e);
      alert("Failed to export Excel report.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 h-[calc(100vh-140px)]">
      {/* Left Pane - Classes List */}
      <div className="w-full md:w-80 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-border pb-6 md:pb-0 md:pr-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight font-sans">Classes</h2>
          <button
            onClick={() => setShowClassModal(true)}
            className="p-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            title="Create Class"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 mt-2">
          {classes.length > 0 ? (
            classes.map((cls) => (
              <div
                key={cls.id}
                onClick={() => setSelectedClass(cls)}
                className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer border transition-all ${
                  selectedClass?.id === cls.id
                    ? "bg-card border-primary shadow-sm"
                    : "bg-muted/10 border-border hover:bg-muted/30"
                }`}
              >
                <BookOpen className={`h-5 w-5 ${selectedClass?.id === cls.id ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block truncate">{cls.name}</span>
                  <span className="text-xs text-muted-foreground truncate block">
                    {cls.description || "No description"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center p-8 border border-dashed border-border rounded-lg">
              <span className="text-xs text-muted-foreground">No classes created.</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane - Selected Class Details */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto h-full pr-2">
        {selectedClass ? (
          <>
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4 gap-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight font-sans">{selectedClass.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{selectedClass.description}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => router.push(`/attendance/session?class=${selectedClass.id}`)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Take Attendance
                </button>

                <button
                  onClick={() => setShowStudentModal(true)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Student
                </button>

                <button
                  onClick={handleExportExcel}
                  disabled={students.length === 0 || historySessions.length === 0}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                  title="Export Attendance Sheet"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Export Sheet
                </button>

                <button
                  onClick={() => handleDeleteClass(selectedClass.id)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-red-500/20 bg-background text-red-500 hover:bg-red-500/10 px-3 transition-colors"
                  title="Delete Class"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Split Grid: Students list vs Historical Sessions */}
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Student Roster */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-bold text-sm text-muted-foreground tracking-wide uppercase font-sans">
                    Student Roster ({students.length})
                  </h3>
                </div>

                <div className="border border-border rounded-lg bg-card overflow-hidden">
                  {students.length > 0 ? (
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/20 font-medium text-muted-foreground">
                          <th className="p-3 w-16">Roll</th>
                          <th className="p-3">Name</th>
                          <th className="p-3 w-28">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr key={student.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                            <td className="p-3 font-semibold font-mono">{student.roll_number}</td>
                            <td className="p-3 font-semibold">{student.name}</td>
                            <td className="p-3">
                              <button
                                onClick={() =>
                                  router.push(
                                    `/students/register?student=${student.id}&class=${selectedClass.id}`
                                  )
                                }
                                className="text-xs text-primary hover:underline font-semibold"
                              >
                                Edit Face
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-12 text-center">
                      <span className="text-sm text-muted-foreground block">No students registered yet.</span>
                      <button
                        onClick={() => setShowStudentModal(true)}
                        className="mt-2 text-xs text-primary hover:underline font-semibold"
                      >
                        Register a student
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Historical Logs */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-bold text-sm text-muted-foreground tracking-wide uppercase font-sans">
                    Session Logs ({historySessions.length})
                  </h3>
                </div>

                <div className="space-y-3">
                  {historySessions.length > 0 ? (
                    historySessions.map((sess) => (
                      <div
                        key={sess.id}
                        onClick={() => router.push(`/attendance/review?session=${sess.id}`)}
                        className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/10 cursor-pointer transition-all"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-sm block">
                            {new Date(sess.date).toLocaleDateString(undefined, {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {sess.presentCount} of {sess.totalCount} students present
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm">{sess.rate}%</span>
                          <span className="text-[10px] text-muted-foreground block">View Log</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/40">
                      <span className="text-sm text-muted-foreground block">No sessions recorded yet.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center max-w-sm mx-auto">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-bold text-lg font-sans">No Class Selected</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Select an existing class from the sidebar or click the plus button on top to create a new class folder.
            </p>
          </div>
        )}
      </div>

      {/* Class Create Modal */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-lg">
            <h3 className="text-lg font-bold font-sans mb-4">Create Class Batch</h3>
            
            <form onSubmit={handleCreateClass} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Class Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade 12 - Science"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Description (Optional)</label>
                <textarea
                  placeholder="e.g. Lectures 9:00 AM - 10:30 AM"
                  value={newClassDesc}
                  onChange={(e) => setNewClassDesc(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-20 resize-none"
                />
              </div>

              {errorMsg && <div className="text-xs text-red-500 font-semibold">{errorMsg}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowClassModal(false);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2 rounded text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClassActionLoading}
                  className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                >
                  {isClassActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Create Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-lg">
            <h3 className="text-lg font-bold font-sans mb-4">Register Student profile</h3>

            <form onSubmit={handleCreateStudent} className="space-y-4">
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
                <label className="text-xs font-bold uppercase text-muted-foreground">Parent Contact (Optional)</label>
                <input
                  type="tel"
                  placeholder="e.g. +91 99999 99999"
                  value={newStudentParent}
                  onChange={(e) => setNewStudentParent(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Notes (Optional)</label>
                <textarea
                  placeholder="Additional student records or medical details"
                  value={newStudentNotes}
                  onChange={(e) => setNewStudentNotes(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-16 resize-none"
                />
              </div>

              {errorMsg && (
                <div className="text-xs text-red-500 font-semibold flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

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
                  className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                >
                  {isStudentActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
