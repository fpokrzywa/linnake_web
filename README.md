# Linnake website

Private AI readiness landing page with a two-step form and instant scoring. Authored page assets live in `public/`; `worker/index.mjs` handles the inquiry endpoint. `npm run build` embeds the page and assets into a single Worker module at `dist/server/index.js`.

Source repository: https://github.com/fpokrzywa/linnake_web

Hosted site: https://linnake-ai-platform.fpokrzywa.chatgpt.site/

GitHub stores the website source, assets, migrations, and tests. Pushing to GitHub does not automatically deploy the Sites-hosted website. Database records, local preview state, credentials, and installed dependencies are excluded from this repository.

## Run and validate

Use `npm ci`, `npm run db:generate` only when the schema changes, `npm test`, `npm run build`, and `npm run dev`. The local preview is http://127.0.0.1:4173 and stores test records in ignored `.local/preview.sqlite`. Local storage is separate from production Cloudflare D1.

## Inquiry submissions

Demo, enterprise, and local-AI inquiries POST to `/api/inquiries`. The server validates the request, inserts a record in the `DB` binding's `inquiries` table, and returns a receipt only after persistence succeeds. The endpoint is write-only; no public endpoint lists or reads inquiry records. Retries use a stable UUID and content hash to avoid duplicates. Size limits, same-origin enforcement, a honeypot, and a five-per-email hourly cap provide basic abuse controls.

The form retains text on failure and reports pending, error, and success states. No email app is opened. Automatic email notifications are not configured.

## Reviewing received inquiries

The site owner can use Sites Settings' database viewer, or ask Codex to read the site's `DB` / `inquiries` table through the Sites connector. Records contain `id`, `request_hash`, `name`, `email`, `company`, `interest`, `message`, `created_at` (Unix milliseconds), and `status` (initially `new`). No public inbox was added. Preview submissions with Website QA names and example.com addresses are tests, not leads.

## Database and deployment

`.openai/hosting.json` preserves the existing Site ID and declares `d1: "DB"`. It no longer uses static hosting. `db/schema.js` is the Drizzle schema, with generated immutable migrations under `drizzle/`. Sites provisions the database and applies these migrations before uploading the Worker. All database access uses bound parameters. Sites manages the hosted URL and access policy.

## Readiness leads and scorecards

The homepage posts to `/api/readiness`. The Worker calculates the score and saves the answers, score and point breakdown in `DB` / `readiness_leads` before returning the result. The table is available to the site owner through the Sites database viewer. The existing `inquiries` table and endpoint serve legacy records and submissions.

The 24-hour scorecard is a manual follow-up. Check new rows by submission time, review the client's use case and hardware answer, and email the scorecard to the work email in the row. Include the first three tasks, a hardware feasibility assessment, and a rough cost range. The form does not send email or independently verify hardware. Review model, workload, and machine details before treating the score as a pilot recommendation.

Set `approvedClientQuote` and `bookingUrl` in `public/readiness.js`. The quote field takes one approved line including name, title, and company. With the field blank, the page shows the data-use pledge. The results show a booking link once a real HTTPS URL is configured. Replace `[FOUNDER BIO]` in `public/index.html` with the approved founder line.
