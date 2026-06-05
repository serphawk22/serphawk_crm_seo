# 9. Branch: `feat/gmail-oauth-integration`

**Feature Description:** Authenticate and send emails natively through Gmail.
**Business Goal:** Ensure emails look personal (not sent from a mass-mailer server) and improve deliverability.
**Frontend Tasks:** Build OAuth connection panel. Update email composer to use Gmail account.
**Backend Tasks:** Implement Google OAuth 2.0 flow, token refresh logic, and `users.messages.send` endpoint.
**Database Tasks:** Create `ConnectedAccount` table.
**AI Tasks:** N/A
**Integrations:** Google Cloud Platform (OAuth & Gmail API).
**Acceptance Criteria:** User can authenticate Gmail and successfully send an email that appears in their actual Gmail Sent folder.
**Dependencies:** None