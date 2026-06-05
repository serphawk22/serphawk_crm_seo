# 14. Branch: `feat/unified-data-ingestion`

**Feature Description:** Centralized search index and RAG database.
**Business Goal:** Break down data silos and enable semantic cross-module search.
**Frontend Tasks:** Global `Cmd+K` search bar.
**Backend Tasks:** Implement full-text search across all models. Build data ingestion pipeline for vector database.
**Database Tasks:** Add `tsvector` indexes.
**AI Tasks:** Enable RAG capabilities for the Global AI Chatbot to query the unified database.
**Integrations:** (Optional) Vector DB like Pinecone/Milvus.
**Acceptance Criteria:** Global search instantly returns matching clients, emails, and competitors.
**Dependencies:** `feat/gmail-sync-engine`, `feat/competitor-monitoring-alerts`

## Customer Intelligence Agent