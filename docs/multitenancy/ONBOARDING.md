# Onboarding a client without a developer

A client is a row of data (a tenant), not a copy of the code. Three ways to get one, all through the same function
(`modules/onboarding.py::create_workspace`), so they behave identically.

| Way | Who | Where |
|---|---|---|
| **Self-registration** | The client | `/register` (link on the login page). Verifies their email with a one-time code, then creates a trial workspace and signs them in. |
| **Client Management** | You (SuperAdmin) | Sidebar > System > *Client Management* > *Onboard a new client*. Pick a preset, country, business type; a login is created. |
| **Bulk** | You | Same page > *Add many clients at once*: one line per client (`account, business, admin name, admin email, preset, country, type`). Download the logins as CSV. API: `POST /superadmin/tenants/bulk`. |

**Client Management page.** Client cards show each client's setup, country, logo, users, leads, modules on and open requests
(filters: all / paid / trial / demo workspaces, search, sort). *New client* and *Add many* open side panels; *Configure*
opens a panel with Modules (switches, search, ready-made setups), Branding & defaults (logo upload, currency, language ...)
and Plan & demo. Every action answers with a notification, and a password is shown once with copy buttons.

## What gets configured automatically

From the company profile (business type + country + what they typed), `recommend_config` picks:

| Business type | Setup (preset) |
|---|---|
| Digital, marketing or design agency | `agency` |
| Logistics, BPO or outsourcing | `bpo` (business suite on) |
| Training institute or education | `institute` (students, courses, batches on) |
| Anything else / not given | `standard` (the CRM every business gets) |

and from the country: currency, time zone, phone dial code and language (English or Spanish). Brand name, website,
contact details and the "what your company does" text for the AI come from the registration form. An Admin can change
every value later on *Company profile* (and *Fill in the blanks from this profile* re-applies the defaults without
overwriting anything they chose). Switching modules on or off is never automatic after the first setup.

## What the client's Admin does next

*Company profile* (sidebar: Branding & Settings) opens with a checklist computed from live data: company name, logo,
contact details, company mailbox, team invited, lead statuses reviewed, first lead added. The same card shows on their
dashboard until the required steps are done.

* **Logo**: upload PNG / JPEG / WebP. It is re-encoded (no SVG, no metadata), stored in the database, and used in the
  menu, invoices, quotes and other PDFs, and emails. A client with its own brand name and no logo never shows
  another company's logo.
* **Lead statuses**: rename, reorder, add. Renaming also renames existing leads. `New` and `Contacted` stay (the CRM sets
  them itself).
* **Invoice look** (branding and layout only): accent colour, logo position, payment details, terms, closing line.
  Numbering, tax and totals are the same for everyone on purpose.
* **Company mailbox**: SMTP / IMAP login with a *Test connection* button; the sending address is proven with a one-time
  code; the password is stored encrypted and never shown again. People can also connect their own mailbox under
  Email Agent > Settings.

## Demo workspace for an organization

Client Management > *Configure* on a client > *Create demo workspace*: a separate trial tenant with the same modules and
branding, eight sample leads and three sample clients, and one `Demo` login (shown once). It never touches the real
records and can be created more than once.

## Self-service demos and Demo Account Data

A visitor clicks *Create a demo workspace* on the login page (`/signup`), verifies their email with a code and gets their
own trial tenant: the `serphawk` modules, demo limits (15 clients/leads, 5 emails, 5 radar searches, 5 projects, 5 calls)
and one `Demo` login. A new Google sign-in gets the same. The verification code is sent from the server mailbox
(`EMAIL_SENDER` / `EMAIL_PASSWORD` / `EMAIL_HOST` on the backend); without it nobody can finish signing up, and the
sign-up form now says so instead of waiting for a code.

*Demo Account Data* (`/admin/telemetry`) manages them. As SuperAdmin you see every demo account; a company Admin sees only
their own company's (Demo logins in their tenant and demo workspaces made for it). Per account: what they did (clients,
leads, radar, emails, calls ...), last activity, upgrade requests, and the actions *Switch off / on* (signs them out and
blocks sign-in), *Reset password* (shown once), and, for SuperAdmins only, *limits and usage reset*, *Convert to client*
(removes the trial limits, the demo user becomes the company Admin, data and modules stay) and *Delete workspace* (the
whole demo tenant, all-or-nothing; never offered for a Demo login inside a real company). The page also lists unfinished
sign-ups of the last 7 days and warns when the server mailbox is not configured.

## When a client wants something the CRM does not do

The client Admin opens *Customization Requests*, describes it, and follows the conversation there. You see every client's
requests in *Client Requests* (SuperAdmin), reply, and move them through Received > In review > Planned > In progress >
Done / Not planned. You get an in-app notification for each new request; the client gets one for each reply or status
change. Build it once as a module (`addons/<name>/`, a feature key, a preset entry), then switch it on for any client.

## Trial and paid

Self-registered workspaces are trials (the existing trial limits apply). *Client Management > Configure > Plan >
Convert to paid* removes them. Clients you create from Client Management are paid unless you tick *Trial account*.

## Limits that matter at 100+ clients

* Tested: 100 clients created through the API in one call, each isolated from the others (`tests/test_onboarding.py`).
* Registration and one-time-code limits are per API process (`modules/ratelimit.py`). With several instances behind a
  load balancer the effective limit is multiplied; move the counters to Redis if that matters.
* Background jobs (inbox sync, reply checker, follow-up scheduler) are in-process threads that scan every tenant. Run
  them in exactly one process (`BACKGROUND_JOBS`), and move them to a worker when the mailbox count grows.
* Logos are in the database (small, 512 px max). Other uploads are still on local disk.
* `ALLOW_DEBUG_OTP=1` makes `/email-otp/send` return the code when no mailbox can send it. **Local development only**;
  the compose file sets it, never set it on a deployed backend.

## Try it yourself: three clients that differ

Sign in as the platform operator (`superadmin@serphawk.in`, local password `password123`) to see Client Management and
Client Requests. The operator is not inside any client's workspace, so *Branding & Settings* only explains that; use
*Client Management > Configure* to change a client from there.

To see what each client's Admin sees, sign in as them. **Use a separate private window (or browser) for each**, because
one browser keeps a single login.

| Client | Login | Password | What is different |
|---|---|---|---|
| Acme Logistics | `admin@acme-logistics.test` | `Acme-test-1` | BPO setup (command center, finance, lead sources, ownership, proposal links), INR, own logo, own lead statuses (Hot, Quote Sent), blue invoices |
| Casa Bella Studio | `admin@casabella.test` | `Bella-test-1` | Agency setup, MXN, Spanish, own logo, pink invoices |
| Plain Goods Co | `admin@plaingoods.test` | `Plain-test-1` | Standard CRM, USD, own logo |

Things to compare: the menu (modules), the logo and name at the top of the menu, *Leads* (each sees only its own lead and
its own status columns), *Branding & Settings* (currency, statuses, invoice look), and an invoice PDF (logo, colour,
payment details and closing line). Create a customization request as one client and answer it as the operator.
These sample clients exist only in the local Docker database.
