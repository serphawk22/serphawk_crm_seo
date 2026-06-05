# 15. Branch: `feat/customer-web-scraper`

**Feature Description:** Automated web crawling to extract services.
**Business Goal:** Automate manual data entry for company profiles.
**Frontend Tasks:** "Scrape Website" button on client profile.
**Backend Tasks:** Build headless browser pipeline to extract raw DOM text. Use AI to parse services.
**Database Tasks:** Create `ClientService` table.
**AI Tasks:** JSON-structured extraction prompt for services.
**Integrations:** Playwright/Puppeteer.
**Acceptance Criteria:** URL input results in a populated list of services offered by the company.
**Dependencies:** None