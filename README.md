# Linnake website

Responsive marketing site with direct inquiry capture. Authored page assets live in `public/`; `worker/index.mjs` handles the inquiry endpoint. `npm run build` embeds the page and assets into a single Worker module at `dist/server/index.js`.

## Run and validate

Use `npm ci`, `npm run db:generate` only when the schema changes, `npm test`, `npm run build`, and `npm run dev`. The local preview is http://127.0.0.1:4173 and stores test records in ignored `.local/preview.sqlite`. Local storage is separate from production Cloudflare D1.

## Inquiry submissions

Demo, enterprise, and local-AI inquiries POST to `/api/inquiries`. The server validates the request, inserts a record in the `DB` binding's `inquiries` table, and returns a receipt only after persistence succeeds. The endpoint is write-only; no public endpoint lists or reads inquiry records. Retries use a stable UUID and content hash to avoid duplicates. Size limits, same-origin enforcement, a honeypot, and a five-per-email hourly cap provide basic abuse controls.

The form retains text on failure and reports pending, error, and success states. No email app is opened. Automatic email notifications are not configured.

## Reviewing received inquiries

The site owner can use Sites Settings' database viewer, or ask Codex to read the site's `DB` / `inquiries` table through the Sites connector. Records contain `id`, `request_hash`, `name`, `email`, `company`, `interest`, `message`, `created_at` (Unix milliseconds), and `status` (initially `new`). No public inbox was added. Preview submissions with Website QA names and example.com addresses are tests, not leads.

## Database and deployment

`.openai/hosting.json` preserves the existing Site ID and declares `d1: "DB"`. It no longer uses static hosting. `db/schema.js` is the Drizzle schema, with generated immutable migrations under `drizzle/`. Sites provisions the database and applies these migrations before uploading the Worker. All database access uses bound parameters. Deployment remains owner-private; public access and a custom domain have not been configured.

## Product content

Linnake incorporates ModelForge's capabilities plus continuous fine-tuning and enterprise local AI on compatible employee devices. No launch dates, pricing, certifications, or autonomous-update claims are invented. Product illustrations are labeled concepts. The Finnish name section links to its dictionary source.
