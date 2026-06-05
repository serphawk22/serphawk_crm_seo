# 6. Branch: `feat/email-campaign-management`

**Feature Description:** Setup, schedule, and dispatch bulk email campaigns.
**Business Goal:** Scale outreach efforts to multiple targets at once.
**Frontend Tasks:** Build Campaign Builder (Audience selection, Draft review, Scheduling).
**Backend Tasks:** Build campaign dispatcher cron job/worker.
**Database Tasks:** Create `EmailCampaign` and `CampaignRecipient` tables.
**AI Tasks:** N/A
**Integrations:** SMTP Provider.
**Acceptance Criteria:** User can select 10 clients and dispatch a scheduled email to all of them.
**Dependencies:** `feat/email-domain-infrastructure`, `feat/ai-email-drafter`