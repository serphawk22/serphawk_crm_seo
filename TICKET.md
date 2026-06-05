# 17. Branch: `feat/marketplace-catalog`

**Feature Description:** Centralized UI displaying all services discovered across all clients.
**Business Goal:** Create a B2B network effect and service comparison engine.
**Frontend Tasks:** Marketplace Dashboard, advanced filters (category, location, company).
**Backend Tasks:** API endpoints to serve aggregated `ClientService` data.
**Database Tasks:** Ensure rigorous indexing on `ClientService` categories.
**AI Tasks:** AI background job to standardize disparate service names into fixed categories.
**Integrations:** N/A
**Acceptance Criteria:** User can filter the global marketplace to show all companies offering "Plumbing".
**Dependencies:** `feat/customer-web-scraper`