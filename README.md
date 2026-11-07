# Mở học — Learning platform MVP

A Vietnamese learning application built for the BTL Cloud course project. Includes a learner dashboard, catalog, enrollment, reading lessons, private notes, server-graded quizzes with saved answers, instructor authoring, private material uploads, and administration.

## What is implemented

- PDF (10 MiB), PNG/JPEG (5 MiB) uploads to private R2 storage.
- Server validates binary magic signatures and serves authorized attachments with strict mime typing.
- Course owners can upload and remove lesson materials with automatic storage cleanup.
- Search by course title/description, category/level filtering, course details.
- Instructor course and lesson editing.

## Architecture

- Cloudflare Pages + Workers runtime with Next.js 15 App Router
- Cloudflare D1 (SQLite) with Drizzle ORM
- Cloudflare R2 object storage for course materials
- Tailwind CSS & shadcn/ui components
