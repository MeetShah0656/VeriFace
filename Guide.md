# ROLE

You are a Senior Staff Software Engineer, AI Engineer, Product Designer, UX Designer, and Security Engineer.

Your task is to build a COMPLETE, production-ready SaaS web application called **VeriFace**.

This is NOT a prototype, MVP, hackathon project, or UI mockup.

It must be a polished, scalable, secure application that can be deployed immediately and used by NGOs, schools, coaching institutes, and tuition classes.

The code should be maintainable, modular, well-documented, and production-grade.

Never use placeholder components or fake implementations if a real implementation is feasible.

--------------------------------------------------

# PROJECT

Name:
VeriFace

Tagline:
Attendance. Verified.

Purpose:

Teachers can register students once.

After registration, each student simply stands in front of the camera.

The AI recognizes the student with very high confidence.

Attendance is marked instantly.

Students DO NOT require phones.

Everything is managed from the teacher's device.

Accuracy is the highest priority.

--------------------------------------------------

# CORE PHILOSOPHY

Do NOT prioritize speed over accuracy.

A slightly slower but highly accurate recognition system is preferred.

Never identify a student using a single camera frame.

Instead:

Detect face

↓

Check face quality

↓

Capture multiple frames

↓

Generate multiple embeddings

↓

Average embeddings

↓

Compare against registered embeddings

↓

Calculate cosine similarity

↓

Only confirm if confidence exceeds configurable threshold.

--------------------------------------------------

# TECH STACK

Frontend

• Next.js 15 App Router

• TypeScript

• Tailwind CSS v4

• shadcn/ui

• Framer Motion

• React Hook Form

• TanStack Query

• Zod

Backend

• Firebase

• Cloud Firestore

• Firebase Security Rules

• Firebase Storage

• Firebase Auth

AI

DO NOT USE face-api.js.

Use:

MediaPipe Face Detector

ONNX Runtime Web

ArcFace Face Recognition Model

Cosine Similarity

IndexedDB for offline cache

Deployment

Vercel

--------------------------------------------------

# AUTHENTICATION

Teachers can

• Google Login

• Email Login

• Reset Password

• Logout

Each teacher only accesses their own data.

--------------------------------------------------

# DASHBOARD

Professional SaaS dashboard.

Cards

Today's Attendance

Total Students

Classes

Attendance %

Late Students

Recent Activity

Quick Actions

Start Attendance

Add Student

Create Class

Reports

Settings

Charts

Daily

Weekly

Monthly

Attendance %

--------------------------------------------------

# CLASS MANAGEMENT

Teachers can

Create

Edit

Archive

Delete

Classes

Examples

Grade 1

Grade 2

Morning Batch

Evening Batch

--------------------------------------------------

# STUDENT REGISTRATION

Teacher selects class.

Adds

Name

Roll Number

Parent Contact

Notes

Open camera.

Automatically guide teacher through registration.

Capture approximately 20 high-quality face samples.

Required angles

Front

Left

Right

Up

Down

Smile

Neutral

Reject

Blur

Eyes closed

Poor lighting

Multiple faces

Face too small

Generate multiple ArcFace embeddings.

Store

Student

Embeddings

Optional images

Registration metadata

--------------------------------------------------

# ATTENDANCE

Teacher opens class.

Clicks

Start Attendance

Camera opens.

Students approach ONE AT A TIME.

Recognition Flow

Detect face

↓

Face quality validation

↓

Capture multiple frames

↓

Generate embeddings

↓

Average embeddings

↓

Compare with database

↓

Confidence score

↓

If confidence passes threshold

Show animation

Play confirmation sound

Display

"Welcome, {Student Name}"

Mark Present

Lock attendance

If student scans again

Display

Already Present

Do NOT duplicate attendance.

Unknown students

Display

Unknown Face

Allow retry.

--------------------------------------------------

# ATTENDANCE REVIEW

Before saving

Display editable table

Columns

Photo

Roll Number

Student

Status

Confidence

Arrival Time

Teacher can modify

Present

Absent

Late

Excused

Submit Attendance

--------------------------------------------------

# REPORTS

Generate

Daily

Weekly

Monthly

Student Reports

Class Reports

Attendance %

Late %

Graphs

Export

Excel

CSV

PDF

--------------------------------------------------

# SEARCH

Instant search.

Filters

Class

Date

Attendance %

Student

Status

Roll Number

--------------------------------------------------

# DATABASE

Create normalized PostgreSQL schema.

Tables

Teachers

Classes

Students

FaceEmbeddings

AttendanceSessions

AttendanceRecords

AuditLogs

Notifications

Settings

Generate SQL migrations.

Create indexes.

--------------------------------------------------

# SECURITY

Firebase Authentication

Firebase Security Rules

Teacher isolation

Encrypted biometric information

Secure API routes

Rate limiting

Validation

Never expose embeddings

Support deleting biometric information

--------------------------------------------------

# OFFLINE SUPPORT

Attendance must work offline.

Store

Embeddings

Attendance

Students

Models

inside IndexedDB.

Automatically sync when internet returns.

--------------------------------------------------

# PERFORMANCE

Load AI models once.

Lazy loading.

Cache models.

Recognition within approximately one second.

Smooth animations.

No UI lag.

--------------------------------------------------

# UI

Design inspiration

Apple

Linear

Vercel

Notion

No Glassmorphism.

Dark Mode

Light Mode

Inter Font

Soft shadows

Rounded corners

Beautiful empty states

Skeleton loaders

Responsive

Professional SaaS quality.

--------------------------------------------------

# ACCESSIBILITY

Keyboard navigation

ARIA labels

Color contrast

Focus states

Screen reader support

--------------------------------------------------

# PROJECT STRUCTURE

Use scalable architecture.

Organize

app/

components/

features/

hooks/

lib/

services/

types/

utils/

styles/

contexts/

No duplicated code.

Strict TypeScript.

Reusable components.

--------------------------------------------------

# SETTINGS

Theme

Camera selection

Recognition threshold

Attendance sound

Language

Profile

Security

--------------------------------------------------

# NOTIFICATIONS

Success

Error

Offline

Sync completed

Attendance saved

Recognition failed

--------------------------------------------------

# README

Generate professional documentation.

Include

Installation

Firebase Setup

Environment Variables

AI Model Setup

Development

Production Deployment

Troubleshooting

Architecture

Folder Structure

--------------------------------------------------

# DEPLOYMENT

The project MUST be deployable without modification.

Generate

Firestore security rules

Storage policies

Authentication policies

Environment variable template

Vercel configuration

Production checklist

--------------------------------------------------

# CODE QUALITY

Strict TypeScript.

ESLint.

Prettier.

No TODOs.

No mock data.

No placeholders.

Proper loading states.

Error boundaries.

Reusable hooks.

Reusable services.

Professional comments only where necessary.

--------------------------------------------------

# FINAL GOAL

Deliver a polished, enterprise-grade attendance management platform.

When someone opens the website,- [/] Project Setup & Core Structure
  - [x] Initialize Next.js 15 App Router in workspace root
  - [x] Setup project directories (components, features, hooks, lib, services, types, utils)
  - [/] Configure Tailwind CSS and app theme provider
  - [x] Install packages (lucide-react, framer-motion, idb, canvas-confetti, onnxruntime-web, @mediapipe/tasks-vision, @tanstack/react-query, firebase, zod, react-hook-form)gnition pipeline, attendance workflow, reporting system, offline functionality, security, deployment configuration, and documentation.

The final output must be a fully deployable application ready for production.