# Spook-a-thon Registration

A static Halloween event site with a Vercel serverless registration endpoint and Supabase Postgres storage. The endpoint validates each submission on the server, stores no secrets in browser code, and enforces unique enrollment number, primary email, and registration code constraints in Postgres. The schema is ready for 1,000+ registrations; actual service capacity depends on the Supabase and Vercel plans and event traffic.

## One-time Supabase setup

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase-schema.sql`](./supabase-schema.sql).
3. In **Project Settings → API**, copy the Project URL and the server-side `service_role` secret. Do not put the secret in `index.html`, commit it, or share it publicly. The table has row-level security enabled and no public read/write access.

## Deploy to Vercel

1. Push this folder to your GitHub repository.
2. In Vercel, **Add New → Project**, import the repository. Use the project root as the root directory; no framework or build command is required.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` under Project Settings → Environment Variables for Production (and Preview only if needed).
4. Deploy. Vercel discovers [`api/register.js`](./api/register.js) as a Node.js Function; the website form posts to `/api/register`.
5. Submit a test registration, then check `public.registrations` in Supabase. Delete the test record afterward.

For local preview, use Vercel CLI (`vercel dev`) after creating a local `.env` from `.env.example` and filling in the values. Never commit `.env`.

## Capacity and privacy

Postgres unique constraints protect against duplicate enrollment numbers/emails even during concurrent submissions. The form stores the first member’s name, flexible enrollment number (in the existing `student_id` database column), phone, email, course, academic year, optional second-member name/phone/email, team size, registration code, and server timestamp. Semester is not collected. Personal email addresses are accepted. Limit dashboard and secret-key access to trusted event admins. Supabase Free currently becomes read-only above 500 MB of database data; check current plan limits and choose a paid plan if the event traffic, retention, uptime, or support needs require it.

## API

`POST /api/register` with JSON fields `fullName`, `enrollmentNumber` (1–32 letters, numbers, slash, or hyphen; legacy `studentId` is also accepted), `phone` (`+91XXXXXXXXXX`), `email`, `course`, `academicYear` (1–4), `teamSize` (1 or 2), and, for a two-person team, `member2: { fullName, phone, email }`. Use `course: "Other"` with `otherCourse` to submit a custom course. Personal email addresses are accepted; semester is not required. Success returns `201 { ok: true, code }`; invalid submissions return `400`, duplicates `409`, and temporary service errors `503`.


## Admin portal

The private admin page is available at `/admin.html`. It supports registration review, editing, deletion, and a paginated export of all rows as an Excel-compatible CSV. Admin requests are authorized on the server with a Supabase Auth access token and the `ADMIN_EMAILS` allowlist; the database secret is never sent to the browser.

To enable it, run the current `supabase-schema.sql` in the Supabase SQL Editor, create and verify an admin user under **Authentication → Users**, then add these Vercel Production environment variables and redeploy:

- `SUPABASE_PUBLISHABLE_KEY`: the project's publishable key (safe for browser sign-in; never use the secret key here).
- `ADMIN_EMAILS`: one or more exact admin account emails, separated by commas.

The existing server-side `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are used for database access. Only allow trusted administrators.
