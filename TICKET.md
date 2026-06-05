# 8. Branch: `feat/email-followup-automation`

**Feature Description:** Automated drip sequences based on recipient behavior.
**Business Goal:** Increase conversion rates by persistently nurturing leads who don't reply.
**Frontend Tasks:** Add multi-step sequence builder to Campaign UI.
**Backend Tasks:** Build automation worker that evaluates rules (e.g., "if no reply in 3 days, send Step 2").
**Database Tasks:** Add `step_number` and `trigger_rules` to `EmailCampaign`.
**AI Tasks:** N/A
**Integrations:** N/A
**Acceptance Criteria:** System automatically dispatches Step 2 of an email campaign if the prospect hasn't replied.
**Dependencies:** `feat/email-tracking-and-analytics`

## Gmail Integration