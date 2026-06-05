# 10. Branch: `feat/gmail-sync-engine`

**Feature Description:** Two-way sync of incoming and outgoing emails to the CRM timeline.
**Business Goal:** Give the entire sales team visibility into client communication history.
**Frontend Tasks:** Update Client Timeline UI to display threaded emails.
**Backend Tasks:** Build a background worker to poll Gmail History API for new messages related to CRM contacts.
**Database Tasks:** Create `EmailMessage` table to store synced threads.
**AI Tasks:** Pass conversation history context to AI Drafter.
**Integrations:** Google Workspace API (Pub/Sub or Polling).
**Acceptance Criteria:** When a client replies to a Gmail email, the reply instantly appears in the CRM timeline.
**Dependencies:** `feat/gmail-oauth-integration`

## WhatsApp Automation