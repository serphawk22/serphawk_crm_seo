# Lead call storage on V2

Adapted from `origin/feature/lead-call-storage-followups` (`bb63ee6`) onto V2 `main` (`4f24194`).
The working branch is `feature/lead-call-storage-followups-v2`. The demo-account work and adaptation are packaged together.
The core table inventory remains unchanged at 97 models; this feature creates no new tables.

## Behaviour and layout

* `routers/lead_conversations.py`: lead AI-call history, follow-up state, conversation creation/editing,
  analysis and threaded replies. Registered before legacy routes; the superseded conversation handlers were removed
  from `main.py`. Signed identity and the existing Inbox/Follow-ups role and ownership policy apply.
* `modules/lead_calls.py`: strict tenant-local lead resolution, transcript normalization for API output,
  latest-call metadata, and synchronization of the call, lead and shared follow-up task. Phone matching requires
  an exact international number and one match. Raw call transcript fields remain intact.
* `modules/conversation_store.py`: commit the transcript before analysis; analyze description, transcript and
  replies together; use a tenant-scoped source key and unique follow-up key for retries. The note scanner shares
  the same keys. Provider failure leaves saved notes available for retry.
* `database.py`: the previously missing Lead, AICall, ConversationLog and FollowUp fields and indexes, with an
  idempotent additive upgrade called from `create_db_and_tables()`. Defaults support existing rows and legacy imports.
* `modules/followup_ai.py`: the source branch's structured intelligence and time/window/condition extraction,
  using the tenant's `timezone` setting and the previous environment/default behaviour as fallback.
* Both `/followups` and the optional business-suite `/follow-ups` board use the same task. Rescheduling,
  completing, reopening or deleting a linked task updates the call and latest lead state. Automatic email sending
  waits for schedule confirmation; AI-created tasks do not enable auto-send themselves.
* Existing leads gain `latest_call_id`, `latest_call_status` and `latest_call_at` in list/detail responses.
  Legacy calls linked by `entity_type=lead` and `entity_id` remain visible without rewriting historical data.

## Differences from the old branch

The root `migrate_*.py` scripts are deliberately omitted: schema changes run through the current boot mechanism.
No historical production calls or customer rows have been backfilled. The old source's tenant-1 exception,
null-tenant phone matching, global idempotency index, invented lead id `0`, invalid `started_at` access and
unprotected authorship ids were replaced. V2's existing tenant-aware voice pitch and greeting are retained.

API additions are under `/leads/{lead_id}`:

* `GET /calls`
* `PATCH /followup` (also updates the linked shared task when one exists)
* `GET|POST /conversations`
* `PATCH /conversations/{conv_id}`
* `POST /conversations/{conv_id}/analyze`
* `GET|POST /conversations/{conv_id}/replies`

Conversation creation now returns a `conversation` object with analysis status and its linked follow-up.
The existing UI refreshes the conversation list after saving and is compatible with this response.
The source branch contains no new frontend screens; this adaptation preserves the existing V2 screens.
The new transcript/analysis fields are available through the API for subsequent UI work.

## Validation

Checked on 2026-10-28: all 528 backend tests pass in Docker (including disposable Postgres tests),
the 47 call-storage/board integration tests pass, and TypeScript reports zero errors.

Use the isolated Docker test service (`docker compose run --rm test`) and
`cd frontend; npx tsc --noEmit -p tsconfig.json`. No production database, mailbox or credentials are needed.
`tests/test_lead_call_storage.py` covers tenant/ownership restrictions, signed-user authorship, real finalization,
durable transcripts, retry deduplication, client calls, shared-board state, tenant time zones and SQLite/Postgres
upgrades of existing tables. Existing migration and follow-up tests cover the legacy shapes.

For the PR, use the V2 adaptation branch with base `main`; merging the original pre-V2 branch is unnecessary.
Publish the combined commit from the V2 adaptation branch. Do not force-push the old branch.
