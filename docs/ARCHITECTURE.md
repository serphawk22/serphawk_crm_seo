# Architecture and conventions

SerpHawk is one multi-tenant product. Every client is a **tenant** (a row, not a fork). What a tenant can use is
controlled by **feature entitlements**; how it looks and behaves is controlled by **tenant settings**. Per-client code
branches do not exist.

## Layout

```
main.py                 FastAPI app: middleware (identity, tenant, feature gate), legacy routes (being extracted)
database.py             SQLModel tables of the core product + schema bootstrap (create_all + additive ALTERs)
routers/                self-contained API groups of the core product (inbox, follow-ups, campaigns, voice agent, tenant config ...)
modules/                shared services: auth tokens, tenant scoping, features, settings, presets, branding, mail, AI, PDFs ...
addons/                 product capabilities that only some clients have; one package per capability
  business_suite/       lead sources, revenue and costs, ownership, command center, AI reports, dropped clients, proposal links
  institute/            students, courses, batches, enrollments, attendance, portals, admissions tracking
frontend/               Next.js app (runs separately: cd frontend && npm run dev)
  src/app/              pages (one folder per route)
  src/components/       shared UI (Sidebar reads features from TenantConfigContext)
  src/context/          RoleContext (session), TenantConfigContext (features + branding)
scripts/migration/      import one client's database into a tenant, and compare the numbers
docker/ + docker-compose.yml   local backend + Postgres + tests, no .env, no real mail
tests/                  unittest suite (in-memory SQLite, plus the local Postgres for RLS and migration tests)
docs/                   this file, multitenancy runbooks, archived early briefs
```

## The three layers of per-client difference

| Question | Mechanism | Where |
|---|---|---|
| Which modules does this client get? | **Feature entitlements**, `tenant_features` rows; a missing row means the registry default | `modules/features.py` |
| How does it look and read? (name, contacts, currency, language, AI persona, role policy, statuses) | **Tenant settings**, one JSON document per tenant | `modules/tenant_settings.py`, `modules/branding.py` |
| Is there a ready-made bundle for a kind of client? | **Presets** (features + settings), applied at onboarding | `modules/presets.py` |

Enforcement: the middleware in `main.py` returns 403 for a disabled module's routes (path prefixes declared in the
feature registry); the frontend hides the menu entries from `GET /me/features`. Anonymous requests (public links,
webhooks) are never gated by the middleware, so public handlers resolve their tenant themselves and check the feature.

## Tenant isolation (read before touching data access)

1. **Identity**: `Authorization: Bearer <signed token>` (`modules/auth_tokens.py`); the legacy `X-User-ID` header works
   only while `LEGACY_USER_HEADER` is not `0`. The tenant always comes from the user's row, never from a header
   (a SuperAdmin may pick one with `X-Tenant-ID`).
2. **ORM filter** (`modules/tenant_scope.py`): every table with a `tenant_id` column is filtered on reads, joins,
   aggregates and bulk UPDATE / DELETE, and new rows are stamped with the request's tenant.
3. **Postgres RLS** (`modules/rls.py`, `RLS_MODE=enforce`): a database-level backstop that also covers raw SQL.
4. Rules for new code: give every new table a `tenant_id` column; never use `skip_tenant=True` in a request handler
   unless the handler resolves and sets the tenant itself; public endpoints look a record up by an unguessable
   secret, then switch the request to that record's tenant; raw `text()` SQL must filter `tenant_id` explicitly.

## Adding something for a client

* **A setting or a look-and-feel difference**: add a key to `SCHEMA` in `modules/tenant_settings.py`, read it with
  `get_setting(tenant_id, key, fallback)` where the behaviour is, and let the client's Admin set it on the
  Branding page. The fallback must equal the previous hard-coded behaviour so existing tenants do not change.
* **A new capability**: create `addons/<name>/` with `models.py` (tables with `tenant_id`) and `routes.py`
  (exporting `routers`), register it in `addons/__init__.py`, declare its feature key and path prefixes in
  `modules/features.py` (`default_on=False`), add the menu entry in `Sidebar.tsx` (`ITEM_ADDON`), put the key in the
  presets that should include it, and write tests (gated, role-checked, isolated, working).
* **Never** copy the repository for a client, and never branch the code per client.

## Running and testing

```
docker compose up -d db api          # backend :8000 + throwaway Postgres (BACKGROUND_JOBS=0, no .env, no real mail)
docker compose run --rm test         # whole suite
cd frontend && npx tsc --noEmit -p tsconfig.json    # must stay at 0 errors
```
