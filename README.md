# Mở học — Learning platform MVP

A Vietnamese learning application built for the BTL Cloud course project. Includes a learner dashboard, catalog, enrollment, reading lessons, private notes, server-graded quizzes with saved answers, instructor authoring, private material uploads, and administration.

## What is implemented

- 6 seeded courses, 18 substantive reading lessons, 18 multiple-choice questions.
- ChatGPT identity supplied and verified by Sites, with server-side role checks.
- Learner, instructor, and administrator roles. The first signed-in visitor **on the initially owner-private Site** becomes the administrator; later visitors default to learner. Open the private Site as its owner to initialize it before any future change to sharing. Role management cannot grant or revoke administrator.
- Search by course title/description, category/level filtering, course details and idempotent enrollment.
- Idempotent completion, progress, actual learning activity, and editable weekly goal. Minutes are the declared reading durations of completed lessons, not measured screen time.
- Notes stored per user and lesson. Empty saved notes are removed.
- Quiz snapshots, one resumable active attempt per course/person, answer persistence, optimistic version checks, expiry at 24 hours, server grading, immutable submitted history, 10 new attempts per course/person/hour.
- Instructor course/lesson/quiz editing. Draft publication checks; published lesson structure is frozen. Content can be corrected, and quiz changes affect only future attempts. Archived courses keep existing enrollment access.
- PDF (10 MiB), PNG/JPEG (5 MiB) uploads to private R2. Server validates signatures and serves authorized attachments. Course owners can remove files.
- Admin role assignment, blocking, course visibility, aggregate counts, and audit log.
- Responsive Vietnamese UI with keyboard focus, labels, and focus-trapped modal forms.

## Architecture

Browser → same-origin Vinext API → Cloudflare D1 (records) / R2 (files).
Authentication is dispatch-owned; application routes never accept a user ID from browser payloads. All writes require a custom header and reject mismatched Origin. R2 downloads pass through an authorization endpoint rather than permanent public object links.

Source entry points:

- `app/page.tsx`: interactive application and all learner/author/admin screens.
- `app/globals.css`: responsive layout and authored course illustrations.
- `app/api/[...path]/route.ts`: API handlers, authorization, validation and persistence.
- `lib/rules.ts`: quiz grading and input/file validation.
- `lib/seed.ts`: sample teaching material; seed answers are never imported into the client.
- `db/schema.ts`, `drizzle/`: schema and migrations.
- `tests/api.test.mjs`: actual API handler tests using SQLite and an in-memory R2 adapter.

## Run locally

Requires Node 22.13 or later and dependencies from the checked-in package/lock files. The Sites starter scripts preserve the supported environment profile. Use `pnpm install --frozen-lockfile` when using pnpm, or the plugin's installation helper in the managed environment.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cultured_thunderbird.sql
npm run dev
```

Apply that migration once to a fresh local database. Later schema changes require appended migrations. Do not replay applied migrations. A portable starter profile supports its built-in loopback sign-in simulation. The managed profile does not simulate authentication. Hosted identity is handled by Sites.

```sh
node tests/api.test.mjs
./node_modules/.bin/tsc --noEmit
```

The tests never touch hosted data. They exercise the real route logic with compatible adapters; they do not replace testing on real D1/R2 or in a browser.

## Deployment

`.openai/hosting.json` binds `DB` and `BUCKET`. Sites provisions D1/R2, applies generated schema migrations, builds and deploys the Worker. Do not copy production identity or secrets into source. Keep source in the Site's repository and publish a version tied to the exact source commit.

The app is initially private to its owner. Sharing/publication to other people is a separate access-policy decision. Initialize the first admin while owner-private; if migrating to a separate hosting stack, replace the bootstrap with an explicit administrator provisioning flow.

## First demo

1. Open the private URL and sign in. The sample courses and owner administrator are initialized.
2. Open **Khám phá**, select **Bắt đầu với lập trình web**, and choose **Ghi danh miễn phí**.
3. Read a lesson, mark it complete, save a note, refresh and check persistence.
4. Open the quiz, answer questions, close/reopen to verify saved answers, submit and review explanations.
5. Use **Giảng viên** to create a draft, add a lesson/quiz, upload a PDF, and publish.
6. Use **Quản trị viên** to check moderation and audit history.

## Deliberate differences from the specification

This is the first runnable MVP, not a claim that all 30 P0 requirements of the 34-page specification have passed acceptance. It uses Sites identity rather than email/password signup, password resets or a separately implemented cookie session stack; Cloudflare rather than the illustrative AWS stack. It uses single-answer quiz authoring per course rather than a separate reusable question bank. Categories are fixed in this version. Course deletion, automatic revision recommendations, video embeds, advanced instructor reports and retention/backup automation are not implemented. File removal deletes the object instead of a seven-day detached lifecycle. No antivirus scanner is connected.

AI tutor, discussion groups, code execution labs, mentor booking, email reminders, payments and certificates are outside this MVP. Account blocking, visibility and quiz results are real server operations. No artificial enrollment counts, learning minutes or reviews are displayed.

## Validation recorded

- Production build and TypeScript checking.
- 45 API checks plus grading/validation boundaries: anonymous/role/ownership guards, cross-origin rejection, idempotency, private notes, redacted quizzes, answer recovery, stale versions, immutable submission, publication prerequisites, frozen structure, file authorization/signatures/removal, moderation and blocking.
- Browser QA could not be performed in the managed preview: `sites-previewd` mailbox was unavailable. No replacement browser infrastructure was launched. Responsive styles and accessible controls are authored but visual/interaction acceptance still needs a real-browser pass.
- Load targets, recovery objectives and a backup restoration exercise from the full specification have not been measured or certified.
