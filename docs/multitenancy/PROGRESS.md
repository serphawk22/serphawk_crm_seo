# Multi-tenancy programme: status and handover

Goal: one repo, one deployment, many clients. Each client gets an admin user, strictly separate data, its own branding
and only the modules it is entitled to. New client requests become a module or a setting, never a fork.

**Nothing has been pushed or deployed.** All work is on local branches of this repo. The three client forks (SCM BPO,
SCM HB, DaPros) were only read; none of them was modified. No real database, mailbox or API key was used: everything ran
against throwaway Docker databases and in-memory SQLite.

## Where to look
| Branch | What it is |
|---|---|
| **`multitenant/integration`** | **Review this one.** Everything below, with the root cleanup merged in. |
| `multitenant/features`, `security/tenant-isolation`, `chore/root-cleanup` | The same work in review-sized pieces (stacked: security, then features; cleanup is separate). |

Verified on `multitenant/integration` (2026-10-23): 458 backend tests pass; `tsc --noEmit` has 0 errors; `next build`
succeeds; a live scenario (21 checks) passes against the real server on Postgres, both normally **and** with
Postgres Row-Level Security enforced for an ordinary database role.

Run it yourself: `docker compose run --rm test` (needs Docker Desktop running), `cd frontend && npx tsc --noEmit`,
`cd frontend && npm run test:phone`.

**Testing with your own API keys.** `docker compose up -d db api` makes the `api` container read your local `.env`
(OpenAI, SMTP mailbox, Firecrawl, ...) but its database is always the throwaway local Postgres: `DATABASE_URL` in `.env`
is ignored on purpose (compose `environment:` wins over `env_file`). The `test` container never reads `.env`. For the
frontend, `frontend/.env.local` (git-ignored) carries the `NEXT_PUBLIC_*` values and the local API address. Background
pollers stay off, so nothing reads your mailbox on its own. Verified with those keys: SMTP login, a live AI call through
the tenant-aware prompt, and the Firecrawl key.
Details: `docs/ARCHITECTURE.md`, `docs/multitenancy/MIGRATION_RUNBOOK.md`.

## What is done

### 1. Isolation (the system was not safe to share between clients before)
Found and fixed with failing tests first:
* The tenant filter covered only plain selects. `count()`/aggregates, column selects, joins, bulk update and bulk delete
  crossed tenants. Rewritten (`modules/tenant_scope.py`).
* An anonymous caller could pick any tenant with `X-Tenant-ID`; a made-up `X-User-ID` resolved to "no tenant" =
  unfiltered, i.e. **every tenant's data**.
* Signed sessions replace trusting a bare user id (`modules/auth_tokens.py`, tokens die on password change).
* A stored password hash was accepted as the password (pass-the-hash). Closed; legacy plaintext accounts still log in.
* Optional Postgres Row-Level Security backstop that also covers raw SQL (`modules/rls.py`).
* `tenant_id` added to the supplier and RFQ-response tables (with backfill).
* **The users table is now tenant-scoped** (it was one global table, so any route that loads a user by id could reach
  another client's users). Look-ups by e-mail stay global on purpose (an e-mail is unique across clients), and a
  user can always load themself. Checked with the full suite, a sweep of 143 GET routes as 6 roles, and the live scenario.
* **Chat WebSocket** (`/ws/chat/{thread}`) had no authentication: anyone could read any thread and post as any user.
  It now needs a signed-in participant of a thread in their own tenant, and the sender is always the authenticated user.
  `/messages/{user_id}` and `/messages/send` stopped trusting ids from the URL / body.
* **`POST /users`** let any logged-in user (even a Client) create an Admin. Now Admin / SalesManager / SuperAdmin only,
  with a matrix of which roles each may create, and it never creates a tenant-less user (those are unscoped).
  `DELETE /users/{id}` is Admin-only.
* **Phone numbers**: one shared country-code selector (`components/PhoneInput.tsx`, all ~230 countries, searchable) on
  Profile, Onboarding and the Email Agent. The country defaults from the client's `default_dial_code` setting, then the
  browser's region, then +1, and can be changed at any time. The Email Agent number no longer has to be entered twice: it
  follows the account profile phone unless someone sets a different one on purpose, and an unedited signature picks up a
  changed number. (The Company phone in Settings, call logging and the website scanner still use a plain field.)
* **Seeded SuperAdmin**: no more published password. Set `SUPERADMIN_PASSWORD` before the first boot, or a one-time
  password is generated and printed once; it is stored hashed. (Existing databases already have their operator account.)

### 2. Per-client control
* **Feature entitlements** per tenant (27 modules + ported add-ons), enforced in the middleware (403) and in the menu.
  Tenants that existed before keep every module they had; ported add-ons start OFF.
* **Tenant settings**: brand, tagline, contacts, currency, language, time zone, dial code, AI company description,
  AI triage persona, fallback email templates, reply-signature behaviour, sign-off words, lead statuses, role policy for
  the Inbox, home dashboard, proposal terms, website-intake key. PDFs, system emails, the AI outreach persona, the CRM
  assistant and the menu follow the tenant's brand; no brand set = exactly as before.
* **Presets**: `standard` (the brand-neutral CRM every business starts from), `full`, `agency`, `agency-voice`, `bpo`,
  `institute`, `design-agency`.
* **Onboarding**: Sidebar > System > *Client Management* (SuperAdmin) or `POST /superadmin/tenants`: tenant + first
  Admin + preset in one step. Tenant Admins edit their own look on *Branding & Settings*.

### 2b. Self-service onboarding (the team's feedback list)
Guide: `docs/multitenancy/ONBOARDING.md`. Status of each point:

| # | Point | Status |
|---|---|---|
| 2 | Automate registration and instance creation | **Done.** `/register` (email code, then a trial workspace and a signed-in Admin), `POST /superadmin/tenants`, bulk (`/superadmin/tenants/bulk`) and the Client Management form all use one function. The old `/signup` was creating nothing (it built a lead with fields that do not exist) and needed no email proof; it now goes through the same checks. |
| 3 | Standard CRM for all businesses | **Done.** `standard` preset; the default for registration and the Client Management form. |
| 4 | Company details and logos | **Done.** Company profile page: details, contacts, defaults, logo upload (stored in the database, used in the menu, PDFs and emails). Fixed on the way: a company with its own brand name used to get the SerpHawk logo on PDFs. |
| 5 | Admin customizes lead status labels | **Done.** Editor on Company profile; renaming moves existing leads; the leads board and form follow the list. `New` and `Contacted` are fixed because the CRM sets them. Other screens that count a specific status (for example the "Qualified" tile) still look for the standard name. |
| 6 | Separate demo account per organization | **Done.** *Create demo workspace* per client: separate tenant, same modules and branding, sample data, one Demo login. |
| 8 | Self-service email integration via company profile | **Done.** Company mailbox card on Company profile with *Test connection*, address proof by code, encrypted password. Fixed on the way: any signed-in user could read the saved SMTP password and overwrite the company mailbox, and a request flag skipped the code check. |
| 9 | Verify follow-up emails and reminders | **Verified, no defect found.** The scheduler is covered by 46 existing tests plus new multi-tenant ones: each reminder goes to its own assignee from its own mailbox, once only, notified inside its tenant. Tested with a fake mail server; no real email was sent. Do one live check from the UI with your own mailbox. |
| 10 | Invoice customization limited to branding / layout | **Done.** Logo, accent colour, logo position, payment details, terms and closing line. Numbering, tax and totals are deliberately not configurable. |
| 11 | Create the three pending client CRMs | **Needs your input.** The tooling is ready (form or bulk lines); I do not know the three clients' names, admin emails and setup. |
| 12 | Auto-configure from the company profile | **Done.** Business type + country choose the preset, currency, time zone, dial code and language; *Fill in the blanks from this profile* does it for an existing workspace without overwriting choices. |
| 13 | Advanced customization via support tickets | **Done.** *Customization Requests* (client Admin) and *Client Requests* (SuperAdmin): conversation, status, priority, in-app notifications both ways. |
| 14 | Less developer involvement | **Done** by 2, 12 and the checklist. A new client needs no code, no deploy and no developer. |
| 15 | Prioritize automated onboarding and scalability | **Done for onboarding; scaling limits listed below.** 100 clients created through the API in one call and isolated, tested. |

Security fixes made while doing this: one-time codes could be guessed (no attempt limit) and were handed back to the
caller whenever the mail failed to send; `/email-otp/verify` raised an error on timezone-aware expiry; codes were
reusable after registering.

### 2c. Route gaps closed (client by client)
Measured by comparing every route of each client repo with this product (`GET`/`POST` + path):
SCM BPO 94% -> 99%, SCM HB 98% -> 99%, DaPros 100%. Safe deploy steps and the evidence for "what happens to the live
database": `docs/multitenancy/DEPLOY.md`.

| Gap | Where it is now |
|---|---|
| BPO follow-up board (`/follow-ups`, 12 routes + the page + the Command Center link that was dead) | `addons/business_suite/follow_up_board.py` (module `followup_board`): a translated view of the ONE shared `follow_ups` table, same access rules as `/followups`; "In Progress" is an open state; overdue notice in the shared scheduler; the importer translates BPO's column names and SCM HB's `crm_follow_ups` |
| Lead webhook (`/leads/webhook`, `/api/leads/webhook`) | `addons/business_suite/lead_tools.py` (module `lead_webhook`). The original let anyone create leads in any company: it now needs the company's own key (Branding & Settings > Website lead form) |
| Auto-assign (BPO `/leads/auto-assign`, HB `/leads/auto-assign-all`, `/leads/{id}/auto-assign-employee`, assign on create) | `modules/lead_assignment.py`: settings `lead_assignment` (workload / revenue) and `lead_auto_assign`; strictly per company (the originals treated "tenant 1" as everyone) |
| Meetings: time zones, video link, "salespeople see only their own" | `main.py` meetings section; the visibility rule and the task-sheet rule below are the setting `sales_scoping` (on in the bpo and institute presets) |
| Task sheet: BPO sales sheet fields, admin-only reading, AI summary, delete, period filter | `main.py`; same setting. Also fixes a live bug: saving an entry failed on the pinned sqlmodel |
| `PATCH /clients/{id}`, `/clients/{id}/status`, `/leads/{id}`, `/leads/{id}/status`, `/meetings/{id}` | `addons/business_suite/client_tools.py`; a client status moves its deals and proposals; only editable fields are accepted (the originals copied any field, tenant_id included); the institute keeps its admission stages on `/status` |
| Client AI report (`/clients/{id}/full-analysis`), `GET /management/dashboard` | `client_tools.py`; the report no longer appends the DaPros service catalogue to other companies' reports |
| `/invoices` page (HB) | `app/invoices/page.tsx` |
| Not ported on purpose | `/api/seed-demo-data` (demo workspaces replace it), `/tasks/{id}/submit` and `/leaderboard/instructors` (no screen calls them; the student portal has its own submit) |

### 2e. Merged with the remote `main` (2026-10-26, branch `multitenant-integration`)
The remote `main` gained five commits (2026-10-23) that ported the SCM BPO modules straight into `main.py` / `routers/`,
ungated, in parallel with our add-ons. Result of the merge (all measured, not assumed):

* **Backend: ours kept.** `routers/{follow_ups,scm2_features,command_center,ai_reports}.py` were removed because
  `addons/business_suite` already serves every one of those routes behind a feature switch. Compared on the same demo data
  (their `seed_demo_crm.py`): 70 of 99 shared read endpoints return the identical shape, the others return everything theirs does
  plus more, and 8 endpoints that answer 500 in their app work in ours. Behaviour matched or better: accepting a public proposal
  (theirs answered 404 for an anonymous visitor), client status changes (theirs 500), drop / reactivate.
* **Taken from them:** the small generic improvements to existing endpoints (owner names on `/leads`, deal `final_value` /
  `won_at`, invoice / proposal links to deals, `user_id` filters), dropped clients that remember `previous_status` and keep
  history with `reactivated_at` (now in our gated add-on, 2 new columns with automatic ALTERs), the demo seed script
  (`python -m scripts.seed_demo_crm`, imports adapted to the add-on models), their new pages and modals.
* **Left out on purpose:** their ungated meeting-visibility rule (ours is the per-company `sales_scoping` setting), the
  unconditional redirect of `/followups` to the board (companies without the board keep the email follow-ups page), their
  Sidebar reorganisation (it removes Deals and Projects from the default menu), the `/scm2/*` alias, and the SCM BPO wording
  that was hard-coded into the lead page (`scmbpo.com`, "BPO Services"): the web-form card now shows the form's own domain.
* **Frontend guards:** the Reports page opens on the classic reports when a company has no Command center / AI reports
  module; the Clients and Leads pages only call dropped-clients / lead-sources when the module is on; any request refused
  because a module is off now shows one "Module not enabled" message (`components/ModuleNotice.tsx`).
* **Fixes on the way:** `/me/timezone` is a personal setting and is no longer gated by "meeting history".
* **New preset `serphawk`** = the core CRM + the business suite the flagship now ships, with `sales_scoping` and the BPO lead
  statuses. Existing companies do not change by themselves: apply it to the original SerpHawk company in Client Management >
  Configure if it should keep the modules upstream gave it.

### 2f. Switched-off modules are really closed (2026-10-26)
Bug: an admin could switch a module off and the menu entry disappeared, but typing the address (`/projects`, `/clients`...)
still opened the page. Now it is driven by the company's own module settings, so changing them later just works:

* **Pages:** `frontend/src/lib/moduleRoutes.ts` lists which module each page belongs to; `components/ModuleGate.tsx` (mounted
  once in `app/layout.tsx`) shows "X is not part of your plan" instead of the page when the company's `/me/features` says off.
  The operator (SuperAdmin) is never gated; if the settings cannot be read the app fails open, like the menu.
* **APIs:** the registry (`modules/features.py`) now also closes the APIs that belong to one module alone (work queue, task sheet,
  leaderboard, meetings). Shared data endpoints (clients, contacts, deals, projects, calls, reports, users) are deliberately
  left open because the dashboard, lead research, the call bar and the analytics pages read them; closing them would break
  modules the company does have. The more specific rule always wins (`/meetings/history`, `/deals/3/negotiations`).
* **Live changes:** the app re-reads the company's modules when the tab regains focus, once a minute, and when someone opens a
  closed page. The server forgets its copy the moment the operator saves (up to 30 s with several backend copies).
  Proven in a browser: module switched on, the signed-in user's page opens without re-login; off again, it closes.
* **To add a page to a module:** one line in `moduleRoutes.ts`; a test fails if a line names a module that does not exist.

### 2d. Moving the clients' existing data in (rehearsed)
Tools (`scripts/migration/`): `inspect_source` (read-only audit of a client database), `import_tenant` (creates the company,
copies its users with their password hashes and every table, renumbers ids), `compare_tenant` (counts and breakdowns on both
sides). Steps and the list of what a database copy cannot carry: `DEPLOY.md`.

Rehearsal on three databases built from each client repo's OWN `database.py` (BPO, HB, DaPros) and imported into one shared
database: all three tenants `ALL SAME` against their source, 0 foreign-key violations, then the new app booted on that
database and used as each client's original admin and rep (same passwords): 33 of 33 checks (own leads and clients only,
other clients' rows answer 404, BPO follow-up board shows its translated follow-ups, HB students / courses / follow-ups
present, institute module refused for BPO, DaPros company mailbox present, operator lists all three).
SCM HB's `crm_follow_ups` is read as `follow_ups` automatically; the AI note ledger is not copied (ids renumbered, unique key).
Not done: HB's `student_id` on follow-ups / e-mails (the audit lists it as a dropped column when a database has data in it).

**What route coverage does NOT show**: the pages themselves. Comparing each client's page files with this product's:
SCM BPO 36 of 84 differ (reports 2.5k lines, proposals, calls, task sheet, clients, teams, leads, meetings, pipeline),
SCM HB 25 of 89 (reports, lead sources, task sheet, leads, leaderboard, calls ...), DaPros 15 of 75 (mostly small; calls and
email agent are the large ones). Some are branding or language; many are real screens. That is the main remaining work
before a client can be switched, and the parallel run is how to find which differences matter.

### 3. Ported from the forks (as add-ons, default OFF, each gated and tested)
* **`addons/business_suite`** (SCM BPO): lead sources and analytics, revenue and business costs, deal negotiation
  rounds, ownership history and reassignment, stock movements, meeting history + user time zone, command center, AI
  reports, dropped clients, public proposal / quote links with accept / reject / comment, quote and proposal to invoice.
* **`addons/institute`** (SCM HB): courses, instructors, batches, students, enrollments and payments, attendance,
  class sessions and progress, learning resources, student and instructor portals, admissions tracking (demo, walk-in,
  webinar, follow-up), convert lead to student, schedule, analytics, website lead intake.
* **DaPros**: its 129 email-stack tests now run against this repo; its behaviours are tenant settings (reply
  signature, sign-off words, triage persona, sender fallbacks) plus one real bug fix: `/generate` crashed with a 500 on
  sqlmodel 0.0.47, and a failed AI call produced a draft whose body was the error message (now a template draft).

Security problems in the original fork code that were **not** carried over: an anonymous request acting as the first
Admin (command center), the public intake webhook defaulting to tenant 1 with no key, proposals readable by sequential
id, comments re-opening a signed proposal, notifications sent to every tenant's admins, no role checks on writing
courses / instructors / logins, cross-tenant reassignment.

### 4. Moving the three live clients
`scripts/migration/import_tenant.py` copies one client's data into a tenant with every id and reference remapped,
`compare_tenant.py` proves the numbers match, and the runbook describes the parallel run and the per-client switch.
Tested on SQLite and on real Postgres. The old systems stay untouched until a client signs off.

## Switches
| Variable | Default | Meaning |
|---|---|---|
| `SESSION_SECRET` | random per process (warns) | **Set in production**, or sessions die on restart / differ per instance |
| `LEGACY_USER_HEADER` | `1` | `1` still accepts the unsigned `X-User-ID`. **While it is `1`, anyone can impersonate a user by guessing an id.** Set `0` once every client runs the new frontend |
| `RLS_MODE` | `off` | `enforce` makes Postgres itself refuse cross-tenant access (see below) |
| `SESSION_TTL_SECONDS` | 604800 | token lifetime |
| `ALLOW_DEBUG_OTP` | off | `1` returns the one-time code in the API response when mail cannot be sent. **Local only** (compose sets it) |

Enabling RLS (tested): as the table owner `python -m modules.rls enable`; run the app as an ordinary role (not superuser,
no BYPASSRLS) with `RLS_MODE=enforce`. `python -m modules.rls disable` reverses it.

## Before you deploy anything
1. Review `multitenant/integration`; merge when happy.
2. Set `SESSION_SECRET` on the backend. Deploy backend and frontend together (the frontend now sends the token).
3. `SELECT id,email,role FROM users WHERE tenant_id IS NULL AND role <> 'SuperAdmin';` - those users are still
   unscoped (kept so nothing breaks); give them a tenant.
4. Flip `LEGACY_USER_HEADER=0` only after the Google Calendar connect link (`EmailTrackerTab.tsx`, sends `?user_id=`)
   is moved to the token. Everything else already sends the token (the chat WebSocket takes it as `?token=`).
5. Rotate the credentials you pasted into the chat (OpenAI key, Gmail app password, Neon password, Firecrawl key).

## Not done (honest list)
* **Other fork code that stayed behind**: the page-level differences above (SCM BPO's reworked reports, sales dashboard
  analytics, proposals, calls, clients, teams, leads and pipeline pages; SCM HB's reports, lead sources, leads, leaderboard
  and sales-manager pages). SCM HB's students inside the email
  stack (student email tab, student follow-ups) and its edits to shared pages (reports, leaderboard, leads list, teams,
  sales-manager). DaPros' Spanish static templates, landing page and its API-proxy / CORS / schema-bootstrap choices.
  These are the "true conflicts" from the audit; each needs a decision per client during its parallel run.
* The finance pages are INR-only (as in the source deployment).
* One e-mail address = one account across all clients. The users table is scoped by the ORM filter but is not covered by
  Postgres RLS yet. Public chat widgets and WhatsApp sessions have no tenant; uploaded files are on local disk;
  background jobs are in-process threads over all tenants.
* Many older routes in `main.py` still have no role check beyond "signed in" (they are tenant-safe now, but a Client
  login can still call staff routes inside its own tenant). The ones touched here are fixed; a full pass per route is a
  separate piece of work.
* Role policy per tenant is wired for the Inbox only.
* **Scaling to 100+ clients**: registration / code rate limits are per process (use Redis behind several instances);
  background jobs are threads scanning every tenant (one process only, then a worker); uploads other than logos are on
  local disk; the sidebar does not hide a status tile when a company renames "Qualified".
* Customization requests notify operators inside the app only (no email to the platform team yet).
* Demo workspaces use the reserved `demo.<id>@demo.invalid` login unless you give an email, so password reset does not
  work for them; copy the password shown when the demo is created.
* `main.py` is still ~19k lines. The new code follows the folder conventions (`addons/`, `modules/`, `routers/`); the old
  routes will move out domain by domain, behind the new tests.
* Three routes already returned 500 before this work (`/monitor-stats`, `/api-intelligence/overview`,
  `/api-intelligence/charts/trend`: naive datetimes on sqlmodel 0.0.47). Untouched.
* Known security items from CLAUDE.md that were not in scope: unsalted SHA-256 for new passwords, `DELETE /debug/purge-leads`,
  the Maps key in `radar_engine.py`, and the hard-coded `admin@serphawk.com` superuser e-mail.
