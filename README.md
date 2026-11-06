# Mở học — Learning platform MVP

A Vietnamese learning application built for the BTL Cloud course project. Includes a learner dashboard, catalog, enrollment, reading lessons, private notes, server-graded quizzes with saved answers, instructor authoring, private material uploads, and administration.

## Architecture

- Cloudflare Pages + Workers runtime with Next.js 15 App Router
- Cloudflare D1 (SQLite) with Drizzle ORM
- Cloudflare R2 object storage for course materials
- Tailwind CSS & shadcn/ui components
