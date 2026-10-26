# Moving a client from its own deployment into the shared system

For the three existing deployments (SCM BPO, SCM HB, DaPros). New clients never go through this: they are created from
a preset (Sidebar > System > Client Management, or `POST /superadmin/tenants`).

The rule: **the client's current system keeps running, untouched, until the client has seen the new one working on their
own data and signed off.** Nothing here writes to a client's live database.

## 0. One-time preparation
* Deploy this branch (backend + frontend) as a **separate, parallel environment** with its own empty Postgres. Never point
  it at a client's production database or at the shared production database while you rehearse.
* On the parallel backend set `BACKGROUND_JOBS=0` (no inbox sync, reply checker or follow-up scheduler) and do not
  configure real SMTP, so it cannot email or reply to the client's real leads. Set `SESSION_SECRET`.
* Local rehearsal: `docker compose up -d db api` gives exactly this (local Postgres, no `.env`, no real mail).

## 1. Take a copy of the client's database
Restore a snapshot of the fork's database into a scratch Postgres (Neon branch, `pg_dump | psql`, ...). The importer only
needs read access to it. Do not use the live database as `--source` unless it is read-only for the importer's role.

## 2. Rehearse
```
python -m scripts.migration.import_tenant \
  --source "postgresql://.../client_copy" --target "postgresql://.../parallel_shared" \
  --source-tenant 1 --tenant-name scmbpo --business-name "SCM BPO" --preset bpo \
  --email-conflict fail --dry-run
```
`--dry-run` does everything inside a transaction and rolls it back. Read the report:
* `fk_violations` must be `{}` (the exit code is 1 otherwise).
* `dangling` counts are references to rows of *other* clients that became empty; they should be small and explainable.
* `unmapped_id_columns` lists integer `*_id` columns with data that the tool has no mapping for. If one appears, add it
  to `SOFT_REFS` in `import_tenant.py` (and a test) before importing for real.
* `email_conflicts`: a user e-mail that already exists for another client. Choose `skip` or `rename`.
Then run it for real into the parallel database (`--yes`), and again with `--replace` whenever you need a fresher copy.

Presets: `bpo` (SCM BPO), `institute` (SCM HB), `design-agency` (DaPros). Use `--skip-tables audit_logs` to leave out
large history you do not need.

## 3. Compare with the live system
```
python -m scripts.migration.compare_tenant --source ".../client_copy" --target ".../parallel_shared" \
  --source-tenant 1 --tenant-name scmbpo
```
Row counts and breakdowns (leads/clients by status, deals by stage and value, users by role, tasks, invoices) must match.
Then log in to both systems as the same people and walk the same screens: dashboard, leads, clients, reports, follow-ups,
inbox, billing. Anything that differs is a bug to fix in this repo. Known, expected differences:
* the original SuperAdmin is not copied (platform operators are managed here);
* uploaded files live on each deployment's local disk and are NOT copied (move `static/uploads/` separately);
* connected mailboxes: users re-enter their Email Integration app password (it is encrypted with a key that is
  specific to each deployment);
* the finance suite pages are INR-only, as in the SCM BPO deployment.

## 4. Switch (per client, after sign-off)
1. Announce a short freeze; make the old system read-only (or stop it).
2. Final `import_tenant --replace` from a fresh copy taken after the freeze, then `compare_tenant`.
3. Point the client's domain at the shared frontend; the client's users log in with the same e-mail and password.
4. Keep the old deployment read-only for a rollback window (suggest 2 weeks), then retire it and its repo.
5. Switch on background jobs on exactly one environment per database: `BACKGROUND_JOBS` unset on the shared production
   backend, `0` everywhere else.

## Rollback
Until step 4 the old system is unchanged: point the domain back. After the switch, new data lives only in the shared
database; a rollback then means exporting that tenant back out, so do not shorten the rollback window.
