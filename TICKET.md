# 5. Branch: `feat/ai-email-drafter`

**Feature Description:** Standalone tool for AI-generated cold email drafts.
**Business Goal:** Save time by automatically writing highly personalized outreach emails.
**Frontend Tasks:** Build drafting UI with tone/goal inputs.
**Backend Tasks:** Create `POST /api/email/draft` endpoint.
**Database Tasks:** N/A
**AI Tasks:** Develop few-shot LLM prompt for B2B cold emails using CRM context.
**Integrations:** OpenAI API.
**Acceptance Criteria:** Providing a client name and goal returns a structured, personalized email within 5 seconds.
**Dependencies:** None