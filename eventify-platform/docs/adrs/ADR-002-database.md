# ADR-002: Database Selection — PostgreSQL and MongoDB

**Status:** Accepted
**Date:** 2026-03-15

## Context
User data is relational and requires ACID. Event/chat data is document-oriented with flexible schemas.

## Decision
Use PostgreSQL for User Service (sharding via Citus). Use MongoDB for Event and Chat services (sharding by event_id).

## Consequences
- **Positive:** Each DB optimized for its workload
- **Negative:** Two DB technologies to manage, no cross-DB joins
