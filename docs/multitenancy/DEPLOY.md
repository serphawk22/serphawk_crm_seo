# Putting this on the live database: what happens, and how to do it safely

Short version: booting this code against your live Neon database only **adds** tables and columns. It never drops or
deletes anything, nobody has to log in again because of the schema, and the old code keeps working on the upgraded database
(so a rollback is just redeploying the previous version). Even so, do **not** test it on production: rehearse on a copy first.

## What we measured (not assumed)

A database was built with the schema the current live code (`main`) creates (92 tables), filled with legacy-style users
(plain-text and sha256 passwords), leads, clients, a deal, a task-sheet entry and a company mailbox, then this branch was
booted against it:

* `python -m scripts.check_schema` (read-only): 30 tables and 46 columns would be created; **0** need a manual migration.
* After one boot: the schema is complete; every login still works (operator, admin, employee, demo, wrong password refused);
  the company has every module it had before; the new add-on modules are off; no brand is forced on it; its 25 leads, 8
  clients and deal are intact and another company's rows are invisible; a company mailbox saved in plain text still sends;
  no row was deleted. 21 of 21 checks.
* The old code, run again on the upgraded database, still reads and writes (rollback is safe).

One bug on the live code was found on the way: saving a **task-sheet entry fails** on the pinned sqlmodel (a naive timestamp
default). It is fixed here.

## What changes for people on day one

| Change | Effect |
|---|---|
| Sessions are signed tokens | Set `SESSION_SECRET` on the backend (a long random value). Without it every restart signs everyone out. Deploy backend and frontend **together**. `LEGACY_USER_HEADER` stays `1`, so an old open tab keeps working during the switch. |
| Stricter permissions | The company mailbox (`/settings/email`) is Admin-only; creating users follows a role matrix; the chat WebSocket needs a login; one-time codes are rate-limited. A workflow that only worked because a route was open to everyone can now answer 403. |
| Task sheet | Saving an entry works (it did not). |
| New menu items | Only for roles that should see them: Branding & Settings and Customization Requests (Admin), Client Management and Client Requests (operator). Add-on modules stay off until you switch them on per company. |

## Do it in this order

1. **Copy the database.** In Neon, create a *branch* of the live database (instant, copy-on-write). Call it `staging`.
2. **Check it (read-only).**
   `set STAGING_URL=postgresql://...` then `python -m scripts.check_schema --url-env STAGING_URL`. Expect exit code 0.
3. **Stand up a staging deployment** (a second Railway service and a Vercel preview) pointing at the branch. Set
   `BACKGROUND_JOBS=0` (two environments must never poll the same mailboxes: they would double-send reminders and emails),
   `SESSION_SECRET`, and no mail credentials (or a mail sink).
4. **Smoke test as real users** on staging: sign in as an admin and an employee, open Leads, Clients, Inbox, Follow-ups,
   Billing, Reports, send nothing. Compare numbers with production.
5. **Production**, in a quiet hour: create a Neon branch of production as the restore point; set `SESSION_SECRET`; deploy
   backend and frontend; read the boot log (`[startup] database: ...` should name your production host); run
   `check_schema` again (exit 0); sign in and look around.
6. **Roll back if needed**: redeploy the previous Railway/Vercel version. The database does not need to be restored.

## Moving the three client deployments in

You do **not** create the client's company or admin by hand first. The importer creates the company (tenant) and copies the
client's own users with their existing password hashes, so the client's admin and staff log in with the passwords they
already have, and see their own data. (If you already created a company of that name by hand, import with `--replace`: it
empties that company and refills it.)

Never read or write a client's live database from a laptop session, and never paste a database URL into a chat or a command
line. Per client:

1. In Neon make a **branch** of that client's database (read-only audit copy) and a **branch of the shared database** to
   import into (`shared-rehearsal`). Neither touches production.
2. Put the URLs in environment variables: `set SRC_URL=...` and `set TGT_URL=...`.
3. **Audit** (read-only): `python -m scripts.migration.inspect_source --source-env SRC_URL --target-env TGT_URL --source-tenant 1`
   lists the companies, every table (carried over / translated / left behind), columns whose data has no home here, and the
   things a database copy cannot carry (see below). Read the "Needs your attention" list.
4. **Rehearse**: `python -m scripts.migration.import_tenant --source-env SRC_URL --target-env TGT_URL --source-tenant 1
   --tenant-name scmbpo --business-name "SCM BPO" --preset bpo --email-conflict rename --dry-run` (nothing is written).
   Presets: SCM BPO `bpo`, SCM HB `institute`, DaPros `design-agency`.
5. **Import** the same command with `--yes` instead of `--dry-run`, then **compare** with the live system:
   `python -m scripts.migration.compare_tenant --source-env SRC_URL --target-env TGT_URL --source-tenant 1 --tenant-name scmbpo`
   (row counts per table and breakdowns by status / stage / role; it must say `ALL SAME`).
6. Deploy the app against the shared-rehearsal branch (`BACKGROUND_JOBS=0`), sign in as the client's admin and staff, and
   click through with the client. Fix differences, then refresh with `--replace` as often as you like.
7. **Switch** one client at a time, after its sign-off: freeze the old system, run the import once more (`--replace`) against
   the **production** shared database (restore point first: a Neon branch), point the client's domain and website forms at
   the new system, and keep the old deployment read-only for a rollback window.

What the importer handles for you:

* SCM HB keeps its follow-ups in `crm_follow_ups`: they are read as the standard `follow_ups` automatically (no flag; if the
  same database also has an unrelated older `follow_ups` table, that one is ignored and listed as left behind). Any other
  renamed table can be mapped with `--table-map TARGET=SOURCE`.
* SCM BPO's follow-ups are translated automatically (owner, outcome, reminder time, lower-case channel / priority).
* A person who is a user in two clients conflicts (one e-mail = one account): `--email-conflict rename` gives the second
  copy a distinct address, `skip` leaves it out. Decide per person with the client.
* **Test accounts and the client's admin:** every fork seeded the same test logins (admin / demo / employee). The shared database keeps ONE such set; import with `--email-conflict skip` so the clients' copies are left out. If a client has no real admin of its own, add `--assign-skipped-to admin@client.com --admin-name "Name"`: that person is created as the company's Admin (a one-time password is printed once) and receives every record that the skipped accounts owned (leads, clients, deals, tasks, history). Their personal notifications and connected mailboxes are not handed over.
* Text longer than the shared column allows (a 560 character tracking URL in `leads.website`) is never cut: that column is widened to TEXT inside the import's transaction.
* A row that needs a user who is not copied (the operator's own mailbox profile or notifications) is skipped and counted; an empty value in a required column takes the column's default.
* Every id is renumbered; every link between rows is rewritten; links to rows that were not imported are cleared and counted.
* Not copied on purpose: SuperAdmin accounts, one-time codes, reset tokens, chat sessions, telemetry, and the AI "note already
  read" ledger (it is rebuilt; only the last few days of notes are read again).

What a database copy cannot carry (the audit lists the ones that apply):

* **Uploaded files** (logos, attachments, payment slips) that sit on the old server's disk: copy the uploads folder and keep the paths, or re-upload.
* **Personal mailbox connections** are encrypted with the old deployment's `EMAIL_CREDENTIAL_ENCRYPTION_KEY`: set the new
  deployment to the same value, or each person reconnects their mailbox.
* **Google / calendar connections** keep working only if the new deployment uses the same Google app.
* **Website lead forms**: the form now needs the company's key (Branding & Settings > Website lead form > Create a key, sent as the `X-API-Key` header). The old open webhook is gone on purpose.
