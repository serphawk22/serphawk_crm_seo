# 3. Branch: `feat/user-feedback-loop`

**Feature Description:** Contextual feedback listeners triggered after key workflows.
**Business Goal:** Continuously capture user satisfaction and bug reports natively.
**Frontend Tasks:** Build toast/modal feedback component, trigger it after CRUD operations.
**Backend Tasks:** Create `POST /api/feedback` endpoint.
**Database Tasks:** Create `UserFeedback` table.
**AI Tasks:** N/A
**Integrations:** N/A
**Acceptance Criteria:** Saving a new client triggers a quick feedback prompt that successfully saves to DB.
**Dependencies:** `feat/design-system-and-themes`

## Email Outbound Product