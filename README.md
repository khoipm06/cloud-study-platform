# Mở học — Learning platform MVP

A Vietnamese learning application built for the BTL Cloud course project. Includes a learner dashboard, catalog, enrollment, reading lessons, private notes, server-graded quizzes with saved answers, instructor authoring, private material uploads, and administration.

## What is implemented

- Search by course title/description, category/level filtering, course details.
- Instructor course and lesson editing. Draft publication checks; published lesson structure is frozen.
- ChatGPT identity supplied and verified by Sites, with server-side role checks.
- Learner, instructor, and administrator roles.
- Seeded course structure with structured reading lessons.

## Architecture

- Cloudflare Pages + Workers runtime with Next.js 15 App Router
- Cloudflare D1 (SQLite) with Drizzle ORM
- Cloudflare R2 object storage for course materials
- Tailwind CSS & shadcn/ui components
