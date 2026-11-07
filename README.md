# Mở học — Learning platform MVP

A Vietnamese learning application built for the BTL Cloud course project. Includes a learner dashboard, catalog, enrollment, reading lessons, private notes, server-graded quizzes with saved answers, instructor authoring, private material uploads, and administration.

## What is implemented

- Idempotent course enrollment and completion tracking.
- Private notes stored per user and lesson; empty notes automatically purged.
- Quiz snapshots, resumable active attempts per course/person, answer persistence, optimistic version checks, 24-hour expiry, server-side grading, and immutable attempt history.
- PDF (10 MiB) and image (5 MiB) uploads to private R2 storage.
- Search by course title/description, category/level filtering, course details.
- Instructor course and lesson editing.

## Architecture

- Cloudflare Pages + Workers runtime with Next.js 15 App Router
- Cloudflare D1 (SQLite) with Drizzle ORM
- Cloudflare R2 object storage for course materials
- Tailwind CSS & shadcn/ui components
