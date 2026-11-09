# Manual processing and idle database usage

The backend starts no recurring mailbox sync, reply checks, follow-up scheduler or database keepalive.
`BACKGROUND_JOBS`, `DB_KEEPALIVE` and the old polling interval variables do not re-enable these jobs.
Saving a due date or a prepared email does not schedule a future task. Staff must run the actions below.

| Location | Action | Result |
| --- | --- | --- |
| Inbox | Sync now | Imports the signed-in user's connected mailbox using the existing sync limits. |
| Inbox (Admin) | Check replies | Checks the current company's mailboxes for replies using the existing five-day window. |
| Follow-ups (Admin, `/followups` and either `/follow-ups` tab) | Send due reminders | Processes up to 25 due reminders and 25 overdue notices. Sends in-app notices and reminder emails when enabled. |
| Follow-ups (Admin, `/followups` and either `/follow-ups` tab) | Send due emails | Sends up to 20 due prepared emails marked for the due batch; successful items are completed. Review old overdue items first. |
| Follow-ups (Admin, `/followups` and either `/follow-ups` tab) | Scan recent notes | Scans up to 10 unprocessed notes/messages from the last seven days, creating or updating follow-ups with the existing AI/rules engine. |
| Lead/client Follow-ups tab | Scan notes, Send email | Existing record-scoped actions remain available to users who can manage that record. |
| Email Agent > campaign | Resume pending | Resumes pending recipients of one queued/sending campaign interrupted by a restart. Live campaigns reject a second run. |
| Email Agent > campaign | Retry failed | Existing retry action. Review failures with uncertain delivery first: the original email may have been delivered before the server stopped. |

Email Agent also shows **Manual actions** near the top, with **Follow-up actions** and **Campaign recovery**.
Recovery loads up to 100 accessible unfinished/failed campaigns only when clicked, without loading the whole history
or running any worker. Use each row's Resume/Retry button to start processing after confirmation.
The standard sidebar opens `/followups`; `/follow-ups` is the separate board view for tenants with that add-on.

Website research validates extracted email addresses before filling **To** and saving a missing lead email. A blank
scraper email line cannot consume the next phone/social heading. The draft ignores malformed cached contact fields,
searches the other contacts for a valid address and preserves a recipient edited by the user. If no address is found,
the field stays empty and asks for manual entry; no address is guessed. Invalid send requests are rejected before
creating a lead or attempting SMTP.

Company-wide follow-up actions require an Admin account inside that company. Requests cannot select another
company through a body or query parameter. Each run is bounded, rate-limited and protected by a cross-process
lock. Existing row claims prevent duplicate reminders/sends from overlapping processing. SMTP delivery after a
process crash is inherently uncertain; campaign recovery marks interrupted sends failed rather than resending them.
Sending actions use the global email confirmation dialog. Each click runs once; nothing schedules another run.
Click again for the next batch after the cooldown. The UI reports counts; email delivery errors also appear on
the affected follow-up or campaign. A campaign explicitly started or resumed still uses its existing finite worker
so a larger upload can finish without holding a browser request open.

Passive notifications, sidebar badges, email status, messaging, campaign progress and call screens pause polling
while hidden or after two minutes without interaction. Returning to the tab or interacting resumes refreshes.
Module settings recheck on focus or an explicit settings refresh rather than every minute. Research progress
checks are already bounded to two or three minutes; visual animations do not query the database.

## Neon configuration and remaining activity

Enable **Scale to Zero** in Neon's compute settings. By default, eligible computes suspend after five minutes
without queries and reconnect when the next real request arrives. The first request may be slower after waking.
Idle browser polling can therefore extend the active window until roughly seven minutes after the last interaction.
Storage and other billable services are separate from active compute usage. See
[Neon Scale to Zero](https://neon.com/docs/introduction/scale-to-zero) and
[compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle).

This change does not alter Neon settings or guarantee zero cost. Website lead forms, inbound webhooks,
email open tracking, live calls, explicitly started campaigns, other deployments, external monitoring that queries
the database, and people using the CRM can still wake it. Use the unauthenticated `/health` route for uptime checks;
its handler does not query the database. Check old Railway deployments and cron services if compute remains
active with all users away. TCP socket keepalives and SQLAlchemy's checkout-time pre-ping/recycle are not
recurring SQL jobs; retaining them allows stale connections to be replaced on real requests.

## Verification

Run the backend suite against throwaway SQLite/Postgres with `.env` loading disabled, and in `frontend/` run
`npx tsc --noEmit -p tsconfig.json`, `node scripts/check-manual-jobs.mjs` and `node scripts/check-research-contacts.mjs`.
The new tests cover authorization, tenant isolation, batch limits, duplicate runs, campaign recovery,
email confirmations and idle browser polling. No schema migration is needed.
